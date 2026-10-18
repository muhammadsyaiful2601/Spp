<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Regression: saving a rate must price the whole year, not whichever semester
 * happened to already exist.
 */
class SppRateSemesterTest extends TestCase
{
    use RefreshDatabase;

    public function seed($class = 'Database\\Seeders\\DatabaseSeeder')
    {
        parent::seed($class);

        DB::table('users')->update(['email_verified_at' => now()]);

        return $this;
    }

    private function tokenFor(string $username): string
    {
        return $this->postJson('/api/v1/auth/login', [
            'username' => $username,
            'password' => 'password',
        ])->assertOk()->json('data.token');
    }

    public function test_saving_a_rate_creates_the_missing_semester(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');
        $yearId = DB::table('academic_years')->where('is_active', true)->value('id');
        $levelId = DB::table('class_levels')->orderBy('sort_order')->value('id');

        // The exact state that used to break: only the first semester configured.
        DB::table('spp_periods')
            ->where('academic_year_id', $yearId)
            ->where('class_level_id', $levelId)
            ->delete();
        DB::table('spp_periods')->insert([
            'academic_year_id' => $yearId, 'class_level_id' => $levelId,
            'name' => 'Semester Ganjil', 'month_start' => 7, 'month_end' => 12,
            'monthly_amount' => 350000, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->withToken($token)->postJson('/api/v1/pimpinan/tarif-spp', [
            'academic_year_id' => $yearId,
            'rates' => [
                ['class_level_id' => $levelId, 'monthly_amount' => 425000],
            ],
        ])->assertOk();

        // Both semesters now carry the new nominal. Before the fix the genap row
        // was never created, so months 1-6 kept pricing at Rp 350.000.
        foreach ([7 => 'Semester Ganjil', 1 => 'Semester Genap'] as $start => $name) {
            $row = DB::table('spp_periods')
                ->where('academic_year_id', $yearId)
                ->where('class_level_id', $levelId)
                ->where('month_start', $start)
                ->first();

            $this->assertNotNull($row, "Semester dengan month_start {$start} harus ada.");
            $this->assertSame($name, $row->name);
            $this->assertEquals(425000, (float) $row->monthly_amount);
        }
    }

    public function test_saving_a_rate_is_idempotent_across_repeated_saves(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');
        $yearId = DB::table('academic_years')->where('is_active', true)->value('id');
        $levelId = DB::table('class_levels')->orderBy('sort_order')->value('id');

        $before = DB::table('spp_periods')
            ->where('academic_year_id', $yearId)
            ->where('class_level_id', $levelId)
            ->count();

        foreach ([375000, 390000, 410000] as $amount) {
            $this->withToken($token)->postJson('/api/v1/pimpinan/tarif-spp', [
                'academic_year_id' => $yearId,
                'rates' => [['class_level_id' => $levelId, 'monthly_amount' => $amount]],
            ])->assertOk();
        }

        // `updateOrInsert` on the natural key must not multiply rows.
        $this->assertSame(
            $before,
            DB::table('spp_periods')
                ->where('academic_year_id', $yearId)
                ->where('class_level_id', $levelId)
                ->count(),
        );

        // Both semesters carry the last submitted nominal, and nothing is left
        // stranded on an earlier value.
        $this->assertSame(2, DB::table('spp_periods')
            ->where('academic_year_id', $yearId)
            ->where('class_level_id', $levelId)
            ->where('monthly_amount', 410000)
            ->count());

        $this->assertSame(0, DB::table('spp_periods')
            ->where('academic_year_id', $yearId)
            ->where('class_level_id', $levelId)
            ->whereIn('monthly_amount', [375000, 390000])
            ->count());
    }

    public function test_a_class_with_no_periods_at_all_gets_both(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');
        $yearId = DB::table('academic_years')->where('is_active', true)->value('id');
        $levelId = DB::table('class_levels')->orderBy('sort_order')->value('id');

        DB::table('spp_periods')
            ->where('academic_year_id', $yearId)
            ->where('class_level_id', $levelId)
            ->delete();

        $this->withToken($token)->postJson('/api/v1/pimpinan/tarif-spp', [
            'academic_year_id' => $yearId,
            'rates' => [['class_level_id' => $levelId, 'monthly_amount' => 500000]],
        ])->assertOk();

        $this->assertSame(2, DB::table('spp_periods')
            ->where('academic_year_id', $yearId)
            ->where('class_level_id', $levelId)
            ->count());
    }
}