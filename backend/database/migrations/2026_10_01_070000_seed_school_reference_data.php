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

    public function down(): void
    {
        DB::table('spp_periods')->delete();
        DB::table('position_rates')->delete();
        DB::table('payment_positions')->delete();
        DB::table('class_levels')->delete();
        DB::table('academic_years')->delete();
    }
};