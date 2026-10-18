<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Keep the audit trail from growing without bound.
 *
 * `ActivityLogger` writes one to three rows per mutation — every sign-in, every
 * payment, every settings change — and nothing ever removed them. On a shared
 * database the table eventually dominates the listing query, and the four
 * aggregate counts the log screen runs per request get slower with it.
 *
 * This trims by age rather than on demand, which is what the manual "Hapus log"
 * button cannot do: a button only helps someone who notices the problem and has
 * time to act, and it resets the clock entirely. A nightly job costs nothing and
 * holds the table at a predictable size forever.
 *
 * Nothing recent is ever touched. The cutoff defaults to 90 days and a floor
 * keeps the newest rows regardless, so misconfiguration cannot wipe the trail.
 */
class PruneActivityLogs extends Command
{
    protected $signature = 'activity-logs:prune
        {--days= : hapus baris yang lebih tua dari sejumlah hari ini}
        {--keep= : jumlah minimum baris terbaru yang wajib tersisa}
        {--dry-run : hanya laporkan berapa yang akan dihapus}';

    protected $description = 'Hapus log aktivitas yang sudah melewati masa retensi';

    public function handle(): int
    {
        $days = (int) ($this->option('days') ?? config('activity.retention_days', 90));
        $keep = (int) ($this->option('keep') ?? config('activity.minimum_rows', 500));
        $dryRun = (bool) $this->option('dry-run');

        if ($days < 1) {
            $this->error('Jumlah hari harus minimal 1.');

            return self::FAILURE;
        }

        $total = DB::table('activity_logs')->count();
        $cutoff = now()->subDays($days);

        // The floor is applied as "keep the newest N", so a trail that is small
        // on purpose — a fresh install, a school that just started — is never
        // trimmed at all.
        $newestIds = DB::table('activity_logs')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(max(0, $keep))
            ->pluck('id');

        $query = DB::table('activity_logs')
            ->where('created_at', '<', $cutoff)
            ->when($newestIds->isNotEmpty(), fn ($builder) => $builder->whereNotIn('id', $newestIds));

        $doomed = (clone $query)->count();

        if ($doomed === 0) {
            $this->info("Tidak ada baris yang perlu dihapus. Total {$total} baris, semuanya lebih baru dari {$cutoff->toDateString()}.");

            return self::SUCCESS;
        }

        if ($dryRun) {
            $this->line("Akan menghapus {$doomed} baris (dari {$total}), lebih tua dari {$cutoff->toDateString()}.");

            return self::SUCCESS;
        }

        $deleted = $query->delete();

        $this->info("{$deleted} baris log aktivitas dihapus.");
        $this->line('  Sisa tabel: '.(DB::table('activity_logs')->count()).' baris.');
        $this->line('  Catatan: pekerjaan ini tidak menulis baris aktivitas — tidak ada yang bisa dicatat setelah tabelnya dipangkas.');
        $this->line('  Kalau jejak pemangkasan sendiri dibutuhkan, jalankan manual dengan --dry-run lebih dulu dan simpan keluarannya.');

        return self::SUCCESS;
    }
}