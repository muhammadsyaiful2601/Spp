<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * Aggregate portal data (students, bills, transactions, tariffs) in one
     * payload so the SPA no longer relies on hard-coded placeholder arrays.
     */
    public function portal(Request $request): JsonResponse
    {
        $yearId = $request->integer('academic_year_id') ?: DB::table('academic_years')->where('is_active', true)->value('id');

        // A bogus id would reach summary()/monthlyRevenue() and dereference a null
        // year, so reject it up front with a clear message instead.
        if ($request->filled('academic_year_id')) {
            abort_unless(
                DB::table('academic_years')->where('id', $yearId)->exists(),
                422,
                'Tahun ajaran tidak ditemukan.',
            );
        }

        return response()->json(['data' => [
            'academic_year' => $yearId ? DB::table('academic_years')->where('id', $yearId)->first() : null,
            'class_levels' => DB::table('class_levels')->orderBy('sort_order')->get(['id', 'name', 'sort_order']),
            'students' => $this->students($yearId),
            'transactions' => $this->transactions(),
            'spp_rates' => $this->sppRates($yearId),
            'position_rates' => $this->positionRates($yearId),
            'summary' => $this->summary($yearId),
        ]]);
    }

    private function students(?int $yearId): Collection
    {
        $paid = DB::table('spp_bills')
            ->where('status', 'lunas')
            ->when($yearId, fn ($query) => $query->where('academic_year_id', $yearId))
            ->get(['student_id', 'month'])
            ->groupBy('student_id');

        return DB::table('students')
            ->join('class_levels', 'class_levels.id', '=', 'students.class_level_id')
            ->where('students.is_active', true)
            ->orderBy('students.full_name')
            ->get(['students.id', 'students.nisn', 'students.student_number', 'students.full_name', 'class_levels.name as class_name'])
            ->map(function ($student) use ($paid) {
                $months = $paid->get($student->id, collect())->pluck('month');

                return [
                    'id' => (int) $student->id,
                    'student_number' => $student->student_number,
                    'nisn' => $student->nisn,
                    'name' => $student->full_name,
                    'class_name' => $student->class_name,
                    // Academic order: Jul..Dec then Jan..Jun, matching the UI month grid.
                    'paid_months' => $months
                        ->map(fn ($month) => $month >= 7 ? $month - 7 : $month + 5)
                        ->sort()
                        ->values(),
                ];
            });
    }

    private function positionRates(?int $yearId): Collection
    {
        return DB::table('position_rates')
            ->join('payment_positions', 'payment_positions.id', '=', 'position_rates.payment_position_id')
            ->join('class_levels', 'class_levels.id', '=', 'position_rates.class_level_id')
            ->where('payment_positions.is_active', true)
            ->when($yearId, fn ($query) => $query->where('position_rates.academic_year_id', $yearId))
            ->orderBy('class_levels.sort_order')
            ->get([
                'position_rates.id', 'position_rates.payment_position_id', 'position_rates.class_level_id',
                'position_rates.amount', 'payment_positions.name as position', 'payment_positions.type',
            ]);
    }

    private function sppRates(?int $yearId): Collection
    {
        return DB::table('spp_periods')
            ->join('class_levels', 'class_levels.id', '=', 'spp_periods.class_level_id')
            ->where('spp_periods.month_start', 7)
            ->when($yearId, fn ($query) => $query->where('spp_periods.academic_year_id', $yearId))
            ->orderBy('class_levels.sort_order')
            ->get(['class_levels.sort_order', 'spp_periods.monthly_amount'])
            ->map(fn ($row) => (float) $row->monthly_amount)
            ->values();
    }

    private function transactions(): Collection
    {
        return DB::table('payment_transactions')
            ->join('students', 'students.id', '=', 'payment_transactions.student_id')
            ->orderByDesc('payment_transactions.paid_at')
            ->limit(100)
            ->get([
                'payment_transactions.id', 'payment_transactions.transaction_number',
                'payment_transactions.type', 'payment_transactions.amount',
                'payment_transactions.paid_at', 'payment_transactions.details',
                'students.full_name as student_name',
            ])
            ->map(function ($transaction) {
                $details = json_decode($transaction->details ?? '{}', true) ?: [];
                $label = $transaction->type === 'spp'
                    ? 'SPP · '.collect($details['months'] ?? [])->map(fn ($month) => $this->monthLabel((int) $month))->implode(', ')
                    : ($details['position'] ?? 'Biaya lain');

                return [
                    'id' => (int) $transaction->id,
                    'number' => $transaction->transaction_number,
                    'student' => $transaction->student_name,
                    'type' => $transaction->type,
                    'detail' => $label,
                    'amount' => (float) $transaction->amount,
                    'status' => 'Lunas',
                    'paid_at' => $transaction->paid_at,
                    'date' => $this->relativeDate($transaction->paid_at),
                ];
            });
    }

    private function summary(?int $yearId): array
    {
        $received = DB::table('payment_transactions')->when($yearId, function ($query) use ($yearId) {
            $year = DB::table('academic_years')->find($yearId);
            $query->whereBetween('paid_at', ["{$year->start_year}-07-01 00:00:00", "{$year->end_year}-06-30 23:59:59"]);
        })->sum('amount');

        $sppDue = DB::table('spp_bills')->where('status', 'belum_bayar')
            ->when($yearId, fn ($query) => $query->where('academic_year_id', $yearId))->sum('amount');
        $nonSppDue = DB::table('non_spp_bills')->sum(DB::raw('amount_due - amount_paid'));

        return [
            'total_received' => (float) $received,
            'spp_arrears' => (float) $sppDue,
            'non_spp_arrears' => (float) $nonSppDue,
            'students_count' => DB::table('students')->where('is_active', true)->count(),
            // July..June buckets so the chart matches the academic month grid.
            'monthly_revenue' => $this->monthlyRevenue($yearId),
        ];
    }

    private function monthlyRevenue(?int $yearId): array
    {
        $rows = DB::table('payment_transactions')->when($yearId, function ($query) use ($yearId) {
            $year = DB::table('academic_years')->find($yearId);
            $query->whereBetween('paid_at', ["{$year->start_year}-07-01 00:00:00", "{$year->end_year}-06-30 23:59:59"]);
        })->get(['paid_at', 'amount']);

        $buckets = array_fill(1, 12, 0.0);
        foreach ($rows as $row) {
            $month = (int) Carbon::parse($row->paid_at)->format('n');
            $buckets[$month] += (float) $row->amount;
        }
        $ordered = [];
        foreach ([7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6] as $month) {
            $ordered[] = (float) $buckets[$month];
        }

        return $ordered;
    }

    private function monthLabel(int $month): string
    {
        $names = [1 => 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

        return $names[$month] ?? (string) $month;
    }

    private function relativeDate(?string $paidAt): string
    {
        if (! $paidAt) {
            return '-';
        }
        $date = Carbon::parse($paidAt);
        $shortMonths = [1 => 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        $time = $date->format('H.i');
        $days = now()->startOfDay()->diffInDays($date->copy()->startOfDay(), false);

        return match (true) {
            $days === 0 => "Hari ini, {$time}",
            $days === -1 => "Kemarin, {$time}",
            default => $date->format('j').' '.($shortMonths[(int) $date->format('n')] ?? '').' '.$date->format('Y').", {$time}",
        };
    }
}