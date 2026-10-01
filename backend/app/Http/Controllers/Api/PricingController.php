<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PricingController extends Controller
{
    public function sppIndex(Request $request): JsonResponse
    {
        $query = DB::table('spp_periods')
            ->join('academic_years', 'academic_years.id', '=', 'spp_periods.academic_year_id')
            ->join('class_levels', 'class_levels.id', '=', 'spp_periods.class_level_id')
            ->select('spp_periods.*', 'academic_years.name as academic_year', 'class_levels.name as class_level');

        if ($request->filled('academic_year_id')) {
            $query->where('spp_periods.academic_year_id', $request->integer('academic_year_id'));
        }

        return response()->json(['data' => $query->orderBy('class_levels.sort_order')->orderBy('spp_periods.month_start')->get()]);
    }

    public function saveSppPeriod(Request $request): JsonResponse
    {
        $data = $request->validate([
            'academic_year_id' => ['required', 'exists:academic_years,id'],
            'class_level_id' => ['required', 'exists:class_levels,id'],
            'name' => ['required', 'string', 'max:100'],
            'month_start' => ['required', 'integer', 'in:1,7'],
            'month_end' => ['required', 'integer', 'in:6,12'],
            'monthly_amount' => ['required', 'numeric', 'min:0', 'max:9999999999.99'],
        ]);
        $monthStart = (int) $data['month_start'];
        $monthEnd = (int) $data['month_end'];
        abort_if(($monthStart === 7 && $monthEnd !== 12) || ($monthStart === 1 && $monthEnd !== 6), 422, 'Rentang bulan semester tidak valid.');

        DB::table('spp_periods')->updateOrInsert([
            'academic_year_id' => $data['academic_year_id'],
            'class_level_id' => $data['class_level_id'],
            'month_start' => $data['month_start'],
            'month_end' => $data['month_end'],
        ], array_merge($data, ['updated_at' => now(), 'created_at' => now()]));

        return response()->json(['message' => 'Tarif SPP berhasil disimpan.']);
    }

    public function positionRates(): JsonResponse
    {
        $rates = DB::table('position_rates')
            ->join('payment_positions', 'payment_positions.id', '=', 'position_rates.payment_position_id')
            ->join('academic_years', 'academic_years.id', '=', 'position_rates.academic_year_id')
            ->join('class_levels', 'class_levels.id', '=', 'position_rates.class_level_id')
            ->where('payment_positions.is_active', true)
            ->select('position_rates.*', 'payment_positions.name as position', 'payment_positions.type', 'academic_years.name as academic_year', 'class_levels.name as class_level')
            ->get();

        return response()->json(['data' => $rates]);
    }

    public function savePositionRate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'type' => ['required', 'in:sekali_bayar,tahunan,cicilan'],
            'is_active' => ['sometimes', 'boolean'],
            'academic_year_id' => ['required', 'exists:academic_years,id'],
            'class_level_id' => ['required', 'exists:class_levels,id'],
            'amount' => ['required', 'numeric', 'min:0', 'max:9999999999.99'],
        ]);

        DB::table('payment_positions')->updateOrInsert(
            ['name' => $data['name']],
            ['type' => $data['type'], 'is_active' => $data['is_active'] ?? true, 'updated_at' => now(), 'created_at' => now()],
        );
        $positionId = DB::table('payment_positions')->where('name', $data['name'])->value('id');

        DB::table('position_rates')->updateOrInsert([
            'payment_position_id' => $positionId,
            'academic_year_id' => $data['academic_year_id'],
            'class_level_id' => $data['class_level_id'],
        ], ['amount' => $data['amount'], 'updated_at' => now(), 'created_at' => now()]);

        return response()->json(['message' => 'Tarif biaya berhasil disimpan.']);
    }
}
