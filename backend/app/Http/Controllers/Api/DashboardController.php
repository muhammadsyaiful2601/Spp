<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\PaymentTransactionQuery;
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
        $yearId ??= DB::table('academic_years')->orderByDesc('start_year')->value('id');

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
        $periodRates = $yearId
            ? DB::table('spp_periods')
                ->where('academic_year_id', $yearId)
                ->get(['class_level_id', 'month_start', 'month_end', 'monthly_amount'])
            : collect();
        $ratesByLevelAndMonth = collect();
        foreach ($periodRates as $period) {
            foreach (range((int) $period->month_start, (int) $period->month_end) as $month) {
                $ratesByLevelAndMonth->put(
                    "{$period->class_level_id}:{$month}",
                    (float) $period->monthly_amount,
                );
            }
        }
        $billsByStudentAndMonth = $yearId
            ? DB::table('spp_bills')
                ->where('academic_year_id', $yearId)
                ->get(['student_id', 'month', 'amount', 'status'])
                ->keyBy(fn ($bill) => "{$bill->student_id}:{$bill->month}")
            : collect();
        $nonSppRates = $yearId
            ? DB::table('position_rates')
                ->join('payment_positions', 'payment_positions.id', '=', 'position_rates.payment_position_id')
                ->where('position_rates.academic_year_id', $yearId)
                ->where('payment_positions.is_active', true)
                ->get([
                    'position_rates.id',
                    'position_rates.class_level_id',
                    'position_rates.amount',
                ])
            : collect();
        $nonSppBills = $yearId
            ? DB::table('non_spp_bills')
                ->join('position_rates', 'position_rates.id', '=', 'non_spp_bills.position_rate_id')
                ->where('position_rates.academic_year_id', $yearId)
                ->get([
                    'non_spp_bills.student_id',
                    'non_spp_bills.position_rate_id',
                    'non_spp_bills.amount_due',
                    'non_spp_bills.amount_paid',
                ])
                ->keyBy(fn ($bill) => "{$bill->student_id}:{$bill->position_rate_id}")
            : collect();

        return DB::table('students')
            ->join('class_levels', 'class_levels.id', '=', 'students.class_level_id')
            ->where('students.is_active', true)
            ->orderBy('students.full_name')
            ->get([
                'students.id', 'students.nisn', 'students.student_number',
                'students.full_name', 'students.class_level_id', 'class_levels.name as class_name',
            ])
            ->map(function ($student) use ($ratesByLevelAndMonth, $billsByStudentAndMonth, $nonSppRates, $nonSppBills) {
                $months = [];
                $arrears = 0.0;
                $nonSppArrears = 0.0;
                $unpaidCount = 0;
                $totalCount = 0;
                foreach (range(1, 12) as $month) {
                    $rate = $ratesByLevelAndMonth->get("{$student->class_level_id}:{$month}");
                    if ($rate === null) {
                        continue;
                    }

                    $bill = $billsByStudentAndMonth->get("{$student->id}:{$month}");
                    if (! $bill) {
                        continue;
                    }

                    $totalCount++;
                    if ($bill->status === 'lunas') {
                        $months[] = $month;
                    } else {
                        $unpaidCount++;
                        $arrears += (float) $bill->amount;
                    }
                }
                foreach ($nonSppRates as $rate) {
                    if ((int) $rate->class_level_id !== (int) $student->class_level_id) {
                        continue;
                    }

                    $bill = $nonSppBills->get("{$student->id}:{$rate->id}");
                    $amountDue = (float) ($bill->amount_due ?? $rate->amount);
                    $amountPaid = (float) ($bill->amount_paid ?? 0);
                    $nonSppArrears += max(0, $amountDue - $amountPaid);
                }

                return [
                    'id' => (int) $student->id,
                    'student_number' => $student->student_number,
                    'nisn' => $student->nisn,
                    'name' => $student->full_name,
                    'class_name' => $student->class_name,
                    'spp_arrears' => $arrears,
                    'non_spp_arrears' => $nonSppArrears,
                    'spp_unpaid_count' => $unpaidCount,
                    'spp_total_count' => $totalCount,
                    // Academic order: Jul..Dec then Jan..Jun, matching the UI month grid.
                    'paid_months' => collect($months)
                        ->map(fn ($month) => $month >= 7 ? $month - 7 : $month + 5)
                        ->sort()->values(),
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
        return PaymentTransactionQuery::base()
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
                return [
                    'id' => (int) $transaction->id,
                    'number' => $transaction->transaction_number,
                    'student' => $transaction->student_name,
                    'type' => $transaction->type,
                    'detail' => PaymentTransactionQuery::describe($transaction->type, $transaction->details),
                    'amount' => (float) $transaction->amount,
                    'status' => 'Lunas',
                    'paid_at' => $transaction->paid_at,
                    'date' => $this->relativeDate($transaction->paid_at),
                ];
            });
    }

    private function summary(?int $yearId): array
    {
        $received = $yearId
            ? $this->transactionsForYear($yearId)->sum('payment_transactions.amount')
            : DB::table('payment_transactions')->sum('amount');

        $spp = $yearId ? $this->sppSummary($yearId) : [
            'arrears' => 0.0,
            'paid_count' => 0,
            'unpaid_count' => 0,
            'total_count' => 0,
        ];
        $nonSppDue = DB::table('non_spp_bills')
            ->join('position_rates', 'position_rates.id', '=', 'non_spp_bills.position_rate_id')
            ->when($yearId, fn ($query) => $query->where('position_rates.academic_year_id', $yearId))
            ->sum(DB::raw('amount_due - amount_paid'));

        return [
            'total_received' => (float) $received,
            'spp_arrears' => $spp['arrears'],
            'spp_paid_count' => $spp['paid_count'],
            'spp_unpaid_count' => $spp['unpaid_count'],
            'spp_total_count' => $spp['total_count'],
            'non_spp_arrears' => (float) $nonSppDue,
            'students_count' => DB::table('students')->where('is_active', true)->count(),
            // July..June buckets so the chart matches the academic month grid.
            'monthly_revenue' => $this->monthlyRevenue($yearId),
        ];
    }

    private function sppSummary(int $yearId): array
    {
        $bills = DB::table('spp_bills')
            ->join('students', 'students.id', '=', 'spp_bills.student_id')
            ->where('spp_bills.academic_year_id', $yearId)
            ->where('students.is_active', true)
            ->get(['spp_bills.month', 'spp_bills.status', 'spp_bills.amount']);

        $arrears = 0.0;
        $paidCount = 0;
        $unpaidCount = 0;

        foreach ($bills as $bill) {
            if ($bill->status === 'lunas') {
                $paidCount++;
            } else {
                $unpaidCount++;
                $arrears += (float) $bill->amount;
            }
        }

        return [
            'arrears' => $arrears,
            'paid_count' => $paidCount,
            'unpaid_count' => $unpaidCount,
            'total_count' => $bills->count(),
        ];
    }

    private function monthlyRevenue(?int $yearId): array
    {
        $query = $yearId
            ? $this->transactionsForYear($yearId)
            : DB::table('payment_transactions');
        $rows = $query->get(['payment_transactions.paid_at', 'payment_transactions.amount']);

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

    private function transactionsForYear(int $yearId)
    {
        return PaymentTransactionQuery::forAcademicYear($yearId);
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
