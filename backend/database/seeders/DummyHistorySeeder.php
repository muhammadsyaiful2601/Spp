<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Data dummy tiga tahun ajaran ke belakang untuk pengetesan.
 *
 * Dijalankan eksplisit via `php artisan db:seed --class=DummyHistorySeeder`.
 * TIDAK dipanggil dari DatabaseSeeder agar `migrate --seed` dan test suite
 * tetap memakai data minimal yang cepat dan deterministik.
 *
 * Idempoten: menghapus baris dummy run sebelumnya sebelum mengisi ulang,
 * sehingga aman dijalankan berulang kali.
 */
class DummyHistorySeeder extends Seeder
{
    private const ACADEMIC_ORDER = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];

    private const FIRST_NAMES = [
        'Ahmad', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fitri', 'Gilang', 'Hana',
        'Irfan', 'Joko', 'Kirana', 'Lutfi', 'Maya', 'Nadia', 'Putri', 'Rizky',
        'Sari', 'Teguh', 'Utami', 'Wahyu', 'Yoga', 'Zahra', 'Andi', 'Bagus',
        'Dinda', 'Farhan', 'Intan', 'Raka', 'Sinta', 'Yusuf',
    ];

    private const LAST_NAMES = [
        'Pratama', 'Saputra', 'Wijaya', 'Kusuma', 'Santoso', 'Nugroho',
        'Rahmawati', 'Putra', 'Hidayat', 'Firmansyah', 'Anggraini', 'Setiawan',
        'Ramadhan', 'Lestari', 'Gunawan', 'Maharani', 'Siregar', 'Halim',
        'Puspita', 'Fauzi',
    ];

    public function run(): void
    {
        $historyYears = [
            ['name' => '2023/2024', 'start' => 2023, 'end' => 2024],
            ['name' => '2024/2025', 'start' => 2024, 'end' => 2025],
            ['name' => '2025/2026', 'start' => 2025, 'end' => 2026],
        ];

        $this->removePreviousDummyRows();

        $now = Carbon::now();
        $levels = DB::table('class_levels')->orderBy('sort_order')->get(['id', 'sort_order']);
        abort_if($levels->isEmpty(), 500, 'Seeder referensi belum jalan: class_levels kosong.');

        $adminId = (int) DB::table('users')->where('username', 'admin')->value('id');
        abort_if($adminId === 0, 500, 'Akun admin belum ada. Jalankan DatabaseSeeder dulu.');

        $yearIds = [];
        foreach ($historyYears as $year) {
            $yearIds[$year['name']] = $this->seedAcademicYear($year, $levels, $now);
        }

        $students = $this->seedStudents($levels, $now);
        $this->seedSppBills($historyYears, $yearIds, $students, $adminId, $now);
        $this->seedNonSppBills($historyYears, $yearIds, $students, $adminId, $now);
    }

    /**
     * Buat tahun ajaran histori beserta tarifnya, dimundurkan ~5% per tahun
     * dari tarif aktif 2026/2027 agar tren grafik naik seperti data nyata.
     */
    private function seedAcademicYear(array $year, $levels, Carbon $now): int
    {
        $yearId = DB::table('academic_years')->insertGetId([
            'name' => $year['name'], 'start_year' => $year['start'], 'end_year' => $year['end'],
            'is_active' => false, 'created_at' => $now, 'updated_at' => $now,
        ]);

        $activeId = (int) DB::table('academic_years')->where('is_active', true)->value('id');
        $deflate = pow(0.95, 2026 - $year['start']);

        foreach ($levels as $level) {
            $base = (float) DB::table('spp_periods')
                ->where('academic_year_id', $activeId)->where('class_level_id', $level->id)
                ->where('month_start', 7)->value('monthly_amount');
            $monthly = round(($base > 0 ? $base : 350000) * $deflate / 5000) * 5000;

            foreach ([['Semester Ganjil', 7, 12], ['Semester Genap', 1, 6]] as [$name, $start, $end]) {
                DB::table('spp_periods')->insert([
                    'academic_year_id' => $yearId, 'class_level_id' => $level->id,
                    'name' => $name, 'month_start' => $start, 'month_end' => $end,
                    'monthly_amount' => $monthly, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }

            $rates = DB::table('position_rates')
                ->where('academic_year_id', $activeId)->where('class_level_id', $level->id)
                ->get(['payment_position_id', 'amount']);
            foreach ($rates as $rate) {
                DB::table('position_rates')->insert([
                    'payment_position_id' => $rate->payment_position_id,
                    'academic_year_id' => $yearId, 'class_level_id' => $level->id,
                    'amount' => round((float) $rate->amount * $deflate / 5000) * 5000,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }

        return $yearId;
    }

    /**
     * Buat 180 siswa dummy (30 per kelas). Prefix `DUM` memisahkan data
     * dummy dari data asli sehingga mudah dikenali dan aman dihapus.
     */
    private function seedStudents($levels, Carbon $now): array
    {
        $students = [];
        $counter = 1;

        foreach ($levels as $level) {
            for ($i = 1; $i <= 30; $i++) {
                $first = self::FIRST_NAMES[($counter * 7 + $level->sort_order) % count(self::FIRST_NAMES)];
                $last = self::LAST_NAMES[($counter * 13 + $i) % count(self::LAST_NAMES)];
                $id = DB::table('students')->insertGetId([
                    'nisn' => 'DUM'.str_pad((string) (9000000000 + $counter), 10, '0', STR_PAD_LEFT),
                    'student_number' => 'DUM-'.str_pad((string) $counter, 5, '0', STR_PAD_LEFT),
                    'full_name' => "{$first} {$last}",
                    'class_level_id' => $level->id, 'is_active' => true,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
                $students[] = ['id' => $id, 'class_level_id' => $level->id, 'seq' => $counter];
                $counter++;
            }
        }

        return $students;
    }

    /**
     * 12 tagihan SPP per siswa per tahun: ~70% lunas penuh, ~20% lunas
     * 8 bulan awal, ~10% belum bayar. Tiap bulan lunas punya satu transaksi
     * `spp` dengan `paid_at` di bulan tagihannya agar grafik dashboard
     * terisi di seluruh rentang tiga tahun.
     */
    private function seedSppBills(array $historyYears, array $yearIds, array $students, int $adminId, Carbon $now): void
    {
        foreach ($historyYears as $year) {
            $yearId = $yearIds[$year['name']];
            $periods = DB::table('spp_periods')->where('academic_year_id', $yearId)->get();

            foreach ($students as $student) {
                $roll = ($student['seq'] * 31 + $year['start']) % 10;
                $paidCount = $roll < 7 ? 12 : ($roll < 9 ? 8 : 0);

                foreach (self::ACADEMIC_ORDER as $position => $month) {
                    $period = $periods->first(fn ($p) => $p->class_level_id === $student['class_level_id']
                        && $p->month_start <= $month && $p->month_end >= $month);
                    $calendarYear = $month >= 7 ? $year['start'] : $year['end'];
                    $isPaid = $position < $paidCount;
                    $paidAt = $isPaid
                        ? Carbon::create($calendarYear, $month, 5 + ($student['seq'] % 20), 9 + ($student['seq'] % 8), 15)
                        : null;

                    $billId = DB::table('spp_bills')->insertGetId([
                        'student_id' => $student['id'], 'academic_year_id' => $yearId,
                        'month' => $month, 'calendar_year' => $calendarYear,
                        'amount' => $period->monthly_amount,
                        'status' => $isPaid ? 'lunas' : 'belum_bayar', 'paid_at' => $paidAt,
                        'created_at' => $now, 'updated_at' => $now,
                    ]);

                    if ($isPaid) {
                        $this->insertTransaction(
                            $student['id'], $adminId, 'spp', $billId,
                            ['bill_ids' => [$billId], 'months' => [$month], 'dummy' => true],
                            (float) $period->monthly_amount, $paidAt, $now
                        );
                    }
                }
            }
        }
    }

    /**
     * Tagihan non-SPP: sekali bayar/tahunan lunas bila termasuk pola bayar;
     * cicilan lunas penuh ~60% dan sebagian ~20%.
     */
    private function seedNonSppBills(array $historyYears, array $yearIds, array $students, int $adminId, Carbon $now): void
    {
        $positions = DB::table('payment_positions')->where('is_active', true)->get(['id', 'type', 'name']);

        foreach ($historyYears as $year) {
            $yearId = $yearIds[$year['name']];
            $rates = DB::table('position_rates')->where('academic_year_id', $yearId)->get();

            foreach ($students as $student) {
                foreach ($rates as $rate) {
                    if ($rate->class_level_id !== $student['class_level_id']) {
                        continue;
                    }
                    $position = $positions->firstWhere('id', $rate->payment_position_id);
                    $roll = ($student['seq'] * 17 + $rate->payment_position_id + $year['start']) % 10;

                    if ($position->type === 'cicilan') {
                        $this->seedInstallment($student, $rate, $position, $roll, $year, $adminId, $now);

                        continue;
                    }

                    $isPaid = $roll < 8;
                    $paidAt = $isPaid ? Carbon::create($year['start'], 8, 10 + ($student['seq'] % 15), 10, 0) : null;
                    $billId = DB::table('non_spp_bills')->insertGetId([
                        'student_id' => $student['id'], 'position_rate_id' => $rate->id,
                        'amount_due' => $rate->amount, 'amount_paid' => $isPaid ? $rate->amount : 0,
                        'status' => $isPaid ? 'lunas' : 'belum_bayar',
                        'created_at' => $now, 'updated_at' => $now,
                    ]);

                    if ($isPaid) {
                        $this->insertTransaction(
                            $student['id'], $adminId, 'non_spp', $billId,
                            ['position' => $position->name, 'position_rate_id' => $rate->id, 'dummy' => true],
                            (float) $rate->amount, $paidAt, $now
                        );
                    }
                }
            }
        }
    }

    private function seedInstallment(array $student, $rate, $position, int $roll, array $year, int $adminId, Carbon $now): void
    {
        $due = (float) $rate->amount;
        $parts = 3;
        $perPart = round($due / $parts);

        if ($roll < 6) {
            $billId = DB::table('non_spp_bills')->insertGetId([
                'student_id' => $student['id'], 'position_rate_id' => $rate->id,
                'amount_due' => $due, 'amount_paid' => $due, 'status' => 'lunas',
                'created_at' => $now, 'updated_at' => $now,
            ]);
            for ($k = 0; $k < $parts; $k++) {
                $amount = $k === $parts - 1 ? $due - $perPart * ($parts - 1) : $perPart;
                $this->insertTransaction(
                    $student['id'], $adminId, 'non_spp', $billId,
                    ['position' => $position->name, 'position_rate_id' => $rate->id, 'installment' => $k + 1, 'dummy' => true],
                    $amount, Carbon::create($year['start'], 9 + $k, 12, 10, 30), $now
                );
            }
        } elseif ($roll < 8) {
            $paidCount = 1 + ($student['seq'] % 2);
            $billId = DB::table('non_spp_bills')->insertGetId([
                'student_id' => $student['id'], 'position_rate_id' => $rate->id,
                'amount_due' => $due, 'amount_paid' => $perPart * $paidCount, 'status' => 'sebagian',
                'created_at' => $now, 'updated_at' => $now,
            ]);
            for ($k = 0; $k < $paidCount; $k++) {
                $this->insertTransaction(
                    $student['id'], $adminId, 'non_spp', $billId,
                    ['position' => $position->name, 'position_rate_id' => $rate->id, 'installment' => $k + 1, 'dummy' => true],
                    (float) $perPart, Carbon::create($year['start'], 9 + $k, 12, 10, 30), $now
                );
            }
        } else {
            DB::table('non_spp_bills')->insert([
                'student_id' => $student['id'], 'position_rate_id' => $rate->id,
                'amount_due' => $due, 'amount_paid' => 0, 'status' => 'belum_bayar',
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    private function insertTransaction(int $studentId, int $userId, string $type, int $refId, array $details, float $amount, ?Carbon $paidAt, Carbon $now): void
    {
        DB::table('payment_transactions')->insert([
            'transaction_number' => strtoupper($type === 'spp' ? 'SPP' : 'NSP')
                .'-DUM-'.($paidAt ? $paidAt->format('Ymd') : $now->format('Ymd'))
                .'-'.Str::upper(Str::random(6)),
            'student_id' => $studentId, 'user_id' => $userId, 'type' => $type,
            'reference_id' => $refId, 'details' => json_encode($details),
            'amount' => $amount, 'paid_at' => $paidAt ?? $now,
            'created_at' => $now, 'updated_at' => $now,
        ]);
    }

    /**
     * Hapus baris dummy run sebelumnya, dibalik dari urutan insert
     * (transaksi dulu, referensi terakhir) agar tidak menabrak FK `restrict`.
     */
    private function removePreviousDummyRows(): void
    {
        DB::table('payment_transactions')->where('transaction_number', 'like', '%-DUM-%')->delete();

        $studentIds = DB::table('students')->where('student_number', 'like', 'DUM-%')->pluck('id');
        if ($studentIds->isNotEmpty()) {
            DB::table('spp_bills')->whereIn('student_id', $studentIds)->delete();
            DB::table('non_spp_bills')->whereIn('student_id', $studentIds)->delete();
            DB::table('students')->whereIn('id', $studentIds)->delete();
        }

        $yearIds = DB::table('academic_years')->whereIn('name', ['2023/2024', '2024/2025', '2025/2026'])->pluck('id');
        if ($yearIds->isNotEmpty()) {
            DB::table('spp_periods')->whereIn('academic_year_id', $yearIds)->delete();
            DB::table('position_rates')->whereIn('academic_year_id', $yearIds)->delete();
            DB::table('academic_years')->whereIn('id', $yearIds)->delete();
        }
    }
}
