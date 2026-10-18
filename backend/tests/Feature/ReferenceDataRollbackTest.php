<?php

namespace Tests\Feature;

use Illuminate\Database\Migrations\Migration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

/**
 * The reference-data migration must be reversible without becoming destructive.
 *
 * Its `up()` is configuration the portal cannot run without. Its `down()` used
 * to be five unfiltered `delete()` calls, which was a live-data hazard rather
 * than a style problem: `spp_bills.academic_year_id` cascades on delete, so one
 * `migrate:rollback` emptied every bill and left `payment_transactions` pointing
 * at rows that no longer existed — after which every money figure resolved to
 * zero without a single error being logged.
 */
class ReferenceDataRollbackTest extends TestCase
{
    use RefreshDatabase;

    /** The migration file under test, loaded fresh so `down()` is callable. */
    private function migration(): Migration
    {
        return require database_path('migrations/2026_10_01_070000_seed_school_reference_data.php');
    }

    public function test_rollback_is_refused_once_the_school_has_students(): void
    {
        $this->seed();

        // The seeder deliberately ships no pupils, so the dependency the guard
        // watches for has to be created here.
        DB::table('students')->insert([
            'nisn' => '0077001122',
            'student_number' => '2601099',
            'full_name' => 'Siswa enrolled',
            'class_level_id' => DB::table('class_levels')->orderBy('sort_order')->value('id'),
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $billsBefore = DB::table('spp_bills')->count();
        $studentsBefore = DB::table('students')->count();
        $transactionsBefore = DB::table('payment_transactions')->count();

        $this->expectException(RuntimeException::class);

        try {
            $this->migration()->down();
        } finally {
            // The refusal has to have changed nothing at all.
            $this->assertSame($billsBefore, DB::table('spp_bills')->count(), 'Tagihan tidak boleh hilang.');
            $this->assertSame($studentsBefore, DB::table('students')->count(), 'Siswa tidak boleh hilang.');
            $this->assertSame($transactionsBefore, DB::table('payment_transactions')->count(), 'Transaksi tidak boleh hilang.');
        }
    }

    public function test_rollback_removes_only_the_seeded_year_when_nothing_depends_on_it(): void
    {
        $this->seed();

        // Clear exactly what the guard watches: no students, no bills, no money.
        DB::table('payment_transactions')->delete();
        DB::table('non_spp_bills')->delete();
        DB::table('spp_bills')->delete();
        DB::table('students')->delete();
        DB::table('position_rates')->delete();

        $this->migration()->down();

        $this->assertDatabaseMissing('academic_years', ['name' => '2026/2027']);
        $this->assertDatabaseMissing('spp_periods', ['name' => 'Semester Ganjil']);
        $this->assertDatabaseMissing('class_levels', ['name' => 'Kelas I']);
        $this->assertDatabaseMissing('payment_positions', ['name' => 'Uang Pendaftaran']);
    }

    public function test_rollback_keeps_a_later_year_that_still_depends_on_the_earlier_configuration(): void
    {
        $this->seed();

        // A second year reusing the seeded class levels and positions is the
        // normal state once the school rolls forward.
        $laterId = DB::table('academic_years')->insertGetId([
            'name' => '2027/2028', 'start_year' => 2027, 'end_year' => 2028,
            'is_active' => false, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $levelId = DB::table('class_levels')->orderBy('sort_order')->value('id');
        $positionId = DB::table('payment_positions')->orderBy('id')->value('id');
        DB::table('position_rates')->insert([
            'payment_position_id' => $positionId, 'academic_year_id' => $laterId,
            'class_level_id' => $levelId, 'amount' => 400000,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        DB::table('payment_transactions')->delete();
        DB::table('non_spp_bills')->delete();
        DB::table('spp_bills')->delete();
        DB::table('students')->delete();

        $this->migration()->down();

        // The seeded year goes...
        $this->assertDatabaseMissing('academic_years', ['name' => '2026/2027']);
        // ...but the configuration the later year still needs survives.
        $this->assertDatabaseHas('academic_years', ['name' => '2027/2028']);
        $this->assertDatabaseHas('position_rates', ['academic_year_id' => $laterId]);
        $this->assertDatabaseHas('class_levels', ['id' => $levelId]);
    }
}