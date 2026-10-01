<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
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
