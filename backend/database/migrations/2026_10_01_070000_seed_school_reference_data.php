<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Reference data required for the portal to function at all.
 *
 * These rows are configuration, not sample content: without class levels and an
 * active academic year no student can be enrolled and no SPP period can be
 * priced. They are inserted with insertOrIgnore so re-running is safe, and the
 * amounts remain editable by `pimpinan` from the settings screen.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('academic_years')->insertOrIgnore([
            'name' => '2026/2027', 'start_year' => 2026, 'end_year' => 2027,
            'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $yearId = DB::table('academic_years')->where('name', '2026/2027')->value('id');

        $roman = [1 => 'I', 2 => 'II', 3 => 'III', 4 => 'IV', 5 => 'V', 6 => 'VI'];
        $levels = [];
        foreach ($roman as $order => $label) {
            DB::table('class_levels')->insertOrIgnore([
                'name' => "Kelas {$label}", 'sort_order' => $order,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $levels[$order] = DB::table('class_levels')->where('sort_order', $order)->value('id');
        }

        $positions = [
            'Uang Pendaftaran' => ['sekali_bayar', 300000],
            'Uang Kegiatan' => ['tahunan', 250000],
            'Uang Pembangunan' => ['cicilan', 1500000],
            'Uang Perpisahan' => ['sekali_bayar', 450000],
            'Seragam dan Perlengkapan' => ['sekali_bayar', 600000],
        ];
        foreach ($positions as $name => [$type, $base]) {
            DB::table('payment_positions')->insertOrIgnore([
                'name' => $name, 'type' => $type, 'is_active' => true,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $positionId = DB::table('payment_positions')->where('name', $name)->value('id');
            foreach ($levels as $order => $levelId) {
                DB::table('position_rates')->insertOrIgnore([
                    'payment_position_id' => $positionId, 'academic_year_id' => $yearId,
                    'class_level_id' => $levelId, 'amount' => $base + (($order - 1) * 10000),
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }

        foreach ($levels as $order => $levelId) {
            foreach ([['Semester Ganjil', 7, 12], ['Semester Genap', 1, 6]] as [$name, $start, $end]) {
                DB::table('spp_periods')->insertOrIgnore([
                    'academic_year_id' => $yearId, 'class_level_id' => $levelId, 'name' => $name,
                    'month_start' => $start, 'month_end' => $end,
                    'monthly_amount' => 350000 + (($order - 1) * 10000),
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
    }

    /**
     * Remove only what this migration inserted.
     *
     * The original version issued five unfiltered `delete()` calls. That was not
     * merely untidy: `spp_bills.academic_year_id` cascades on delete, so a
     * single `migrate:rollback` on a live database wiped every bill, left
     * `payment_transactions` pointing at rows that no longer existed, and made
     * every money figure resolve to zero with nothing logged about it.
     *
     * So the rollback is scoped to this migration's own rows, and it refuses
     * outright once the school has real data attached to them. Refusing loudly
     * beats silently destroying a ledger.
     */
    public function down(): void
    {
        $yearId = DB::table('academic_years')->where('name', '2026/2027')->value('id');

        if ($yearId !== null) {
            // `spp_bills` is the one dependency that cascades, so it is the one
            // that can vanish without anyone asking.
            $inUse = DB::table('spp_bills')->where('academic_year_id', $yearId)->exists()
                || DB::table('students')->exists()
                || DB::table('payment_transactions')->exists();

            if ($inUse) {
                throw new RuntimeException(
                    'Rollback ditolak: tahun ajaran 2026/2027 sudah dipakai oleh data sekolah '
                    .'(siswa, tagihan, atau transaksi). Hapus data tersebut secara sadar bila '
                    .'memang diperlukan, lalu jalankan ulang. Migration ini tidak boleh '
                    .'menghapus riwayat keuangan.'
                );
            }

            DB::table('spp_periods')->where('academic_year_id', $yearId)->delete();
            DB::table('position_rates')->where('academic_year_id', $yearId)->delete();
        }

        // `payment_positions` and `class_levels` carry no year, so they are
        // matched on the exact keys this migration wrote rather than wiped
        // wholesale.
        //
        // A position is only removed when no rate survives for it. The scoped
        // `position_rates` delete above already cleared this year's rates, so
        // anything still pointing at a position is later-year configuration and
        // must survive. `non_spp_bills` hangs off `position_rates`, and those
        // have a `restrictOnDelete` foreign key, which turns a mistake into a
        // loud failure instead of a silent loss.
        DB::table('payment_positions')
            ->whereIn('name', ['Uang Pendaftaran', 'Uang Kegiatan', 'Uang Pembangunan', 'Uang Perpisahan', 'Seragam dan Perlengkapan'])
            ->whereNotExists(
                fn ($query) => $query->select(DB::raw(1))
                    ->from('position_rates')
                    ->whereColumn('position_rates.payment_position_id', 'payment_positions.id')
            )
            ->delete();

        // A class level is referenced by `students`, `spp_periods` and
        // `position_rates`, and the latter two cascade on delete. Checking only
        // `students` was not enough: with no pupils enrolled, dropping a level
        // silently took a later year's rates and periods with it.
        DB::table('class_levels')
            ->whereIn('name', ['Kelas I', 'Kelas II', 'Kelas III', 'Kelas IV', 'Kelas V', 'Kelas VI'])
            ->whereNotExists(
                fn ($query) => $query->select(DB::raw(1))->from('students')
                    ->whereColumn('students.class_level_id', 'class_levels.id')
            )
            ->whereNotExists(
                fn ($query) => $query->select(DB::raw(1))->from('position_rates')
                    ->whereColumn('position_rates.class_level_id', 'class_levels.id')
            )
            ->whereNotExists(
                fn ($query) => $query->select(DB::raw(1))->from('spp_periods')
                    ->whereColumn('spp_periods.class_level_id', 'class_levels.id')
            )
            ->delete();

        if ($yearId !== null) {
            DB::table('academic_years')->where('id', $yearId)->delete();
        }
    }
};