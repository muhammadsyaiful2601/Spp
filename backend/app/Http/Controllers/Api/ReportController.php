<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\PaymentTransactionQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    /**
     * Upper bound on one report response.
     *
     * Reports are documents: silently dropping rows would produce a statement
     * that totals less than the dashboard it explains. The cap is therefore set
     * far above a realistic year (a few thousand payments) and exists only to
     * stop an unbounded year from becoming an out-of-memory request. If a real
     * school ever approaches it, the report needs pagination rather than a
     * bigger magic number.
     */
    private const MAX_ROWS = 5000;

    /**
     * Every payment matching the filters, SPP and non-SPP together.
     *
     * The portal payload is capped at the 100 most recent transactions because
     * the dashboard only ever renders a short recent list. Reports cannot share
     * that cap — they are the record of what was actually collected — so they
     * read the full history here instead.
     */
    public function pembayaran(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'academic_year_id' => ['nullable', 'integer', 'exists:academic_years,id'],
            'class_level_id' => ['nullable', 'integer', 'exists:class_levels,id'],
            'student_id' => ['nullable', 'integer', 'exists:students,id'],
            'month' => ['nullable', 'integer', 'between:1,12'],
        ]);

        $yearId = $filters['academic_year_id']
            ?? DB::table('academic_years')->where('is_active', true)->value('id');

        $query = PaymentTransactionQuery::forAcademicYear($yearId === null ? null : (int) $yearId)
            ->join('students', 'students.id', '=', 'payment_transactions.student_id')
            ->join('class_levels', 'class_levels.id', '=', 'students.class_level_id')
            ->select([
                'payment_transactions.id',
                'payment_transactions.transaction_number',
                'payment_transactions.type',
                'payment_transactions.amount',
                'payment_transactions.paid_at',
                'payment_transactions.details',
                'students.id as student_id',
                'students.full_name as student_name',
                'class_levels.name as class_name',
            ]);

        if ($filters['class_level_id'] ?? null) {
            $query->where('students.class_level_id', $filters['class_level_id']);
        }
        if ($filters['student_id'] ?? null) {
            $query->where('students.id', $filters['student_id']);
        }
        if ($filters['month'] ?? null) {
            $query->whereMonth('payment_transactions.paid_at', $filters['month']);
        }

        $rows = $query
            ->orderByDesc('payment_transactions.paid_at')
            ->orderByDesc('payment_transactions.id')
            ->limit(self::MAX_ROWS)
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'number' => $row->transaction_number,
                'student' => $row->student_name,
                'student_id' => (int) $row->student_id,
                'class_name' => $row->class_name,
                'type' => $row->type,
                'detail' => PaymentTransactionQuery::describe($row->type, $row->details),
                'amount' => (float) $row->amount,
                'status' => 'Lunas',
                'paid_at' => $row->paid_at,
                'date' => PaymentTransactionQuery::formatDate($row->paid_at),
            ]);

        return response()->json([
            'data' => $rows,
            'meta' => [
                'count' => $rows->count(),
                // Surfaced rather than assumed: a truncated report must be
                // visible to the user, never quietly passed off as complete.
                'truncated' => $rows->count() >= self::MAX_ROWS,
                'limit' => self::MAX_ROWS,
                'academic_year_id' => $yearId === null ? null : (int) $yearId,
            ],
        ]);
    }

    public function spp(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->transactions($request, 'spp')->paginate(50)]);
    }

    public function nonSpp(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->transactions($request, 'non_spp')->paginate(50)]);
    }

    public function dashboard(Request $request): JsonResponse
    {
        $yearId = $request->integer('academic_year_id') ?: DB::table('academic_years')->where('is_active', true)->value('id');
        $received = DB::table('payment_transactions')->when($yearId, function ($query) use ($yearId) {
            $year = DB::table('academic_years')->find($yearId);
            if ($year) {
                $query->whereBetween('paid_at', ["{$year->start_year}-07-01 00:00:00", "{$year->end_year}-06-30 23:59:59"]);
            }
        });
        $transactions = (clone $received)->get(['amount', 'type', 'paid_at']);
        $sppDue = DB::table('spp_bills')->where('status', 'belum_bayar')->when($yearId, fn ($query) => $query->where('academic_year_id', $yearId))->sum('amount');
        $nonSppDue = DB::table('non_spp_bills')->sum(DB::raw('amount_due - amount_paid'));
        $monthly = $transactions->groupBy(fn ($item) => substr($item->paid_at, 0, 7))
            ->map(fn ($items, $month) => ['month' => $month, 'amount' => (float) $items->sum('amount')])->values();

        return response()->json(['data' => [
            'total_received' => (float) $transactions->sum('amount'),
            'spp_arrears' => (float) $sppDue,
            'non_spp_arrears' => (float) $nonSppDue,
            'students_count' => DB::table('students')->where('is_active', true)->count(),
            'monthly_revenue' => $monthly,
            'by_type' => $transactions->groupBy('type')->map(fn ($items) => (float) $items->sum('amount')),
        ]]);
    }

    private function transactions(Request $request, string $type)
    {
        $query = DB::table('payment_transactions')->join('students', 'students.id', '=', 'payment_transactions.student_id')
            ->join('class_levels', 'class_levels.id', '=', 'students.class_level_id')
            ->where('payment_transactions.type', $type)
            ->select('payment_transactions.*', 'students.full_name as student_name', 'students.student_number', 'class_levels.name as class_level');

        if ($request->filled('class_level_id')) {
            $query->where('students.class_level_id', $request->integer('class_level_id'));
        }
        if ($request->filled('from')) {
            $query->whereDate('payment_transactions.paid_at', '>=', $request->date('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('payment_transactions.paid_at', '<=', $request->date('to'));
        }

        return $query->orderByDesc('payment_transactions.paid_at');
    }
}
