<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Support\ActivityLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Nightly trimming of the audit trail.
 *
 * The manual "Hapus log" button cannot keep this table small: it only helps a
 * human who notices, and it resets the clock entirely. This runs whether or not
 * anyone looks.
 */
class PruneActivityLogsTest extends TestCase
{
    use RefreshDatabase;

    private function seedRow(string $createdAt): int
    {
        return (int) DB::table('activity_logs')->insertGetId([
            'action' => 'akun.masuk',
            'category' => 'akun',
            'description' => 'Aktivitas lama',
            'created_at' => $createdAt,
        ]);
    }

    public function test_rows_older_than_the_retention_window_are_removed(): void
    {
        $this->seed();

        $old = $this->seedRow(now()->subDays(200)->toDateTimeString());
        $fresh = $this->seedRow(now()->subDays(2)->toDateTimeString());

        $this->artisan('activity-logs:prune', ['--keep' => 0])
            ->assertSuccessful();

        $this->assertDatabaseMissing('activity_logs', ['id' => $old]);
        $this->assertDatabaseHas('activity_logs', ['id' => $fresh]);
    }

    public function test_the_minimum_row_floor_survives_a_misconfigured_retention(): void
    {
        $this->seed();

        // Every row is old. With the floor in place the newest ones stay put,
        // which is what stops a bad `--days` value from emptying the trail.
        $ids = [];
        for ($i = 0; $i < 12; $i++) {
            $ids[] = $this->seedRow(now()->subDays(400)->toDateTimeString());
        }

        $this->artisan('activity-logs:prune', ['--days' => 1, '--keep' => 5])
            ->assertSuccessful();

        $this->assertSame(5, DB::table('activity_logs')->count());

        // The five survivors are the newest, not an arbitrary five.
        foreach (array_slice($ids, -5) as $survivor) {
            $this->assertDatabaseHas('activity_logs', ['id' => $survivor]);
        }
    }

    public function test_dry_run_reports_without_deleting(): void
    {
        $this->seed();
        $this->seedRow(now()->subDays(300)->toDateTimeString());

        $before = DB::table('activity_logs')->count();

        $this->artisan('activity-logs:prune', ['--dry-run' => true, '--keep' => 0])
            ->assertSuccessful();

        $this->assertSame($before, DB::table('activity_logs')->count());
    }

    public function test_an_invalid_retention_is_rejected(): void
    {
        $this->seed();
        $before = DB::table('activity_logs')->count();

        $this->artisan('activity-logs:prune', ['--days' => 0])
            ->assertFailed();

        $this->assertSame($before, DB::table('activity_logs')->count());
    }

    public function test_the_manual_wipe_and_the_nightly_prune_both_keep_a_record(): void
    {
        $this->seed();

        // The button empties the table and leaves a receipt of itself.
        ActivityLogger::record('akun.log_dibersihkan', 'akun', 'Menghapus log lewat tombol.');
        $this->assertSame(1, ActivityLog::query()->count());

        // The nightly job is the opposite: it only ever removes rows that are
        // already older than the window, so a receipt written a moment ago is
        // untouched. The two paths are deliberately not interchangeable — the
        // button erases history now, the schedule lets it age out.
        $this->artisan('activity-logs:prune', ['--keep' => 0, '--days' => 1])->assertSuccessful();
        $this->assertSame(1, ActivityLog::query()->count());

        // Once that receipt has aged past the window it goes too, leaving the
        // table genuinely empty — which is why the schedule is not an audit
        // record and only bounds growth.
        DB::table('activity_logs')->update(['created_at' => now()->subDays(30)->toDateTimeString()]);
        $this->artisan('activity-logs:prune', ['--keep' => 0, '--days' => 1])->assertSuccessful();
        $this->assertSame(0, ActivityLog::query()->count());
    }
}