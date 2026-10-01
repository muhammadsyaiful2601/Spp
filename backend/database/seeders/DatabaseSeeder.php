<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        DB::table('academic_years')->updateOrInsert(
            ['name' => '2026/2027'],
            ['start_year' => 2026, 'end_year' => 2027, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
        );
        $yearId = DB::table('academic_years')->where('name', '2026/2027')->value('id');
        $levels = [];
        foreach (range(1, 6) as $number) {
            $roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'][$number];
            DB::table('class_levels')->updateOrInsert(
                ['sort_order' => $number],
                ['name' => "Kelas {$roman}", 'created_at' => now(), 'updated_at' => now()],
            );
            $levels[$number] = DB::table('class_levels')->where('sort_order', $number)->value('id');
        }

        DB::table('school_profiles')->updateOrInsert(['id' => 1], [
            'school_name' => 'SD Cendekia Bangsa',
            'foundation_name' => 'Yayasan Cendekia Nusantara',
            'address' => 'Jl. Melati No. 28, Bandung, Jawa Barat',
            'phone' => '(022) 7201 884',
            'email' => 'info@cendekiabangsa.sch.id',
            'receipt_note' => 'Terima kasih telah melakukan pembayaran tepat waktu.',
            'receipt_template' => 'standard',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $positions = [
            ['Uang Kegiatan', 'tahunan', 250000],
            ['Uang Pembangunan', 'cicilan', 1500000],
            ['Uang Perpisahan', 'sekali_bayar', 450000],
            ['Seragam dan Perlengkapan', 'sekali_bayar', 600000],
            ['Uang Pendaftaran', 'sekali_bayar', 300000],
        ];
        foreach ($positions as [$name, $type, $amount]) {
            DB::table('payment_positions')->updateOrInsert(
                ['name' => $name], ['type' => $type, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            );
            $positionId = DB::table('payment_positions')->where('name', $name)->value('id');
            foreach ($levels as $number => $levelId) {
                DB::table('position_rates')->updateOrInsert(
                    ['payment_position_id' => $positionId, 'academic_year_id' => $yearId, 'class_level_id' => $levelId],
                    ['amount' => $amount + (($number - 1) * 10000), 'created_at' => now(), 'updated_at' => now()],
                );
            }
        }

        foreach ($levels as $levelId) {
            foreach ([['Semester Ganjil', 7, 12], ['Semester Genap', 1, 6]] as [$name, $start, $end]) {
                DB::table('spp_periods')->updateOrInsert(
                    ['academic_year_id' => $yearId, 'class_level_id' => $levelId, 'month_start' => $start, 'month_end' => $end],
                    ['name' => $name, 'monthly_amount' => 350000 + (($levelId - 1) * 10000), 'created_at' => now(), 'updated_at' => now()],
                );
            }
        }

        foreach ([
            ['0128456731', '2401001', 'Alya Putri Ramadhani', 1],
            ['0128456732', '2401002', 'Bima Aditya Pratama', 1],
            ['0117345610', '2302041', 'Citra Maharani', 2],
        ] as [$nisn, $number, $name, $level]) {
            DB::table('students')->updateOrInsert(
                ['nisn' => $nisn],
                ['student_number' => $number, 'full_name' => $name, 'class_level_id' => $levels[$level], 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            );
        }

        if (app()->environment(['local', 'testing'])) {
            User::updateOrCreate(['username' => 'pimpinan'], [
                'name' => 'Nadia Amalia', 'email' => 'pimpinan@cendekiabangsa.test',
                'password' => Hash::make('password'), 'role' => 'pimpinan',
            ]);
            User::updateOrCreate(['username' => 'admin'], [
                'name' => 'Admin Keuangan', 'email' => 'admin@cendekiabangsa.test',
                'password' => Hash::make('password'), 'role' => 'admin',
            ]);
        }
    }
}
