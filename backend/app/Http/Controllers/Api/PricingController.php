<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
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

        ActivityLogger::record(
            'tarif.spp_periode',
            'tarif',
            "Menyimpan tarif SPP periode {$data['name']}.",
            ['meta' => [
                'monthly_amount' => (float) $data['monthly_amount'],
                'academic_year_id' => $data['academic_year_id'],
                'class_level_id' => $data['class_level_id'],
            ]],
        );

        return response()->json(['message' => 'Tarif SPP berhasil disimpan.']);
    }

    public function positionRates(Request $request): JsonResponse
    {
        $data = $request->validate([
            'academic_year_id' => ['required', 'exists:academic_years,id'],
        ]);
        $rates = DB::table('position_rates')
            ->join('payment_positions', 'payment_positions.id', '=', 'position_rates.payment_position_id')
            ->join('academic_years', 'academic_years.id', '=', 'position_rates.academic_year_id')
            ->join('class_levels', 'class_levels.id', '=', 'position_rates.class_level_id')
            ->where('position_rates.academic_year_id', $data['academic_year_id'])
            ->select('position_rates.*', 'payment_positions.name as position', 'payment_positions.type', 'payment_positions.is_active', 'academic_years.name as academic_year', 'class_levels.name as class_level')
            ->orderBy('class_levels.sort_order')
            ->orderBy('payment_positions.name')
            ->get();

        return response()->json(['data' => $rates]);
    }

    public function deletePosition(int $position): JsonResponse
    {
        $paymentPosition = DB::table('payment_positions')->where('id', $position)->first();
        abort_unless($paymentPosition, 404, 'Pos biaya tidak ditemukan.');
        $hasBills = DB::table('non_spp_bills')
            ->join('position_rates', 'position_rates.id', '=', 'non_spp_bills.position_rate_id')
            ->where('position_rates.payment_position_id', $position)
            ->exists();
        abort_if(
            $hasBills,
            422,
            'Pos biaya tidak dapat dihapus karena sudah memiliki catatan tagihan atau pembayaran. Nonaktifkan pos agar riwayat tetap tersimpan.',
        );

        DB::transaction(function () use ($position) {
            DB::table('position_rates')->where('payment_position_id', $position)->delete();
            DB::table('payment_positions')->where('id', $position)->delete();
        });

        ActivityLogger::record(
            'tarif.pos_hapus',
            'tarif',
            "Menghapus pos biaya {$paymentPosition->name}.",
            [
                'subject_type' => 'payment_position',
                'subject_id' => $position,
                'subject_label' => $paymentPosition->name,
            ],
        );

        return response()->json(['message' => 'Pos biaya berhasil dihapus.']);
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

        ActivityLogger::record(
            'tarif.pos_biaya',
            'tarif',
            "Menyimpan pos biaya {$data['name']}.",
            ['meta' => [
                'type' => $data['type'],
                'amount' => (float) $data['amount'],
                'academic_year_id' => $data['academic_year_id'],
                'class_level_id' => $data['class_level_id'],
            ]],
        );

        return response()->json(['message' => 'Tarif biaya berhasil disimpan.']);
    }

    /**
     * Save every SPP rate for a year in one request.
     *
     * Each class owns two semester rows (`month_start` 7 and 1). Both are updated
     * so the single nominal shown in the UI really applies to the whole year, and
     * the two standard semesters are created when a class has none yet — otherwise
     * a newly added class would silently price at Rp 0.
     */
    public function saveSppRates(Request $request): JsonResponse
    {
        $data = $request->validate([
            'academic_year_id' => ['required', 'exists:academic_years,id'],
            'rates' => ['required', 'array', 'min:1'],
            'rates.*.class_level_id' => ['required', 'exists:class_levels,id'],
            'rates.*.monthly_amount' => ['required', 'numeric', 'min:0', 'max:9999999999.99'],
        ]);

        DB::transaction(function () use ($data) {
            foreach ($data['rates'] as $rate) {
                $updated = DB::table('spp_periods')
                    ->where('academic_year_id', $data['academic_year_id'])
                    ->where('class_level_id', $rate['class_level_id'])
                    ->update([
                        'monthly_amount' => $rate['monthly_amount'],
                        'updated_at' => now(),
                    ]);

                if ($updated === 0) {
                    foreach ([['Semester Ganjil', 7, 12], ['Semester Genap', 1, 6]] as [$name, $start, $end]) {
                        DB::table('spp_periods')->insert([
                            'academic_year_id' => $data['academic_year_id'],
                            'class_level_id' => $rate['class_level_id'],
                            'name' => $name,
                            'month_start' => $start,
                            'month_end' => $end,
                            'monthly_amount' => $rate['monthly_amount'],
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                    }
                }
            }
        });

        ActivityLogger::record(
            'tarif.spp',
            'tarif',
            'Memperbarui tarif SPP untuk '.count($data['rates']).' tingkat kelas.',
            ['meta' => [
                'academic_year_id' => $data['academic_year_id'],
                'rates' => $data['rates'],
            ]],
        );

        return response()->json(['message' => 'Tarif SPP berhasil disimpan.']);
    }

    /**
     * Save non-SPP amounts for one class level, plus whether each position is
     * active. Bulk so the whole form is one atomic request instead of 30.
     */
    public function savePositionRates(Request $request): JsonResponse
    {
        $data = $request->validate([
            'academic_year_id' => ['required', 'exists:academic_years,id'],
            'class_level_id' => ['required', 'exists:class_levels,id'],
            'positions' => ['required', 'array', 'min:1'],
            'positions.*.payment_position_id' => ['required', 'exists:payment_positions,id'],
            'positions.*.amount' => ['required', 'numeric', 'min:0', 'max:9999999999.99'],
            'positions.*.is_active' => ['sometimes', 'boolean'],
        ]);

        DB::transaction(function () use ($data) {
            foreach ($data['positions'] as $position) {
                DB::table('position_rates')->updateOrInsert([
                    'payment_position_id' => $position['payment_position_id'],
                    'academic_year_id' => $data['academic_year_id'],
                    'class_level_id' => $data['class_level_id'],
                ], [
                    'amount' => $position['amount'],
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                // The flag lives on the position itself, so it applies to all classes.
                if (array_key_exists('is_active', $position)) {
                    DB::table('payment_positions')
                        ->where('id', $position['payment_position_id'])
                        ->update([
                            'is_active' => $position['is_active'],
                            'updated_at' => now(),
                        ]);
                }
            }
        });

        ActivityLogger::record(
            'tarif.non_spp',
            'tarif',
            'Memperbarui tarif biaya non-SPP untuk '.count($data['positions']).' pos.',
            ['meta' => [
                'academic_year_id' => $data['academic_year_id'],
                'class_level_id' => $data['class_level_id'],
                'positions' => $data['positions'],
            ]],
        );

        return response()->json(['message' => 'Tarif biaya berhasil disimpan.']);
    }

    /** Create a new cost position and price it for every class level. */
    public function storePosition(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100', 'unique:payment_positions,name'],
            'type' => ['required', 'in:sekali_bayar,tahunan,cicilan'],
            'amount' => ['required', 'numeric', 'min:0', 'max:9999999999.99'],
            'academic_year_id' => ['required', 'exists:academic_years,id'],
        ]);

        $positionId = DB::transaction(function () use ($data) {
            $positionId = (int) DB::table('payment_positions')->insertGetId([
                'name' => $data['name'],
                'type' => $data['type'],
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            // Price it across every class so the new item is usable immediately.
            foreach (DB::table('class_levels')->orderBy('sort_order')->pluck('id') as $levelId) {
                DB::table('position_rates')->insert([
                    'payment_position_id' => $positionId,
                    'academic_year_id' => $data['academic_year_id'],
                    'class_level_id' => $levelId,
                    'amount' => $data['amount'],
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            return $positionId;
        });

        ActivityLogger::record(
            'tarif.pos_baru',
            'tarif',
            "Menambah pos biaya {$data['name']}.",
            [
                'subject_type' => 'payment_position',
                'subject_id' => $positionId,
                'subject_label' => $data['name'],
                'meta' => [
                    'type' => $data['type'],
                    'amount' => (float) $data['amount'],
                    'academic_year_id' => $data['academic_year_id'],
                ],
            ],
        );

        return response()->json([
            'data' => ['id' => $positionId, 'name' => $data['name']],
            'message' => "Pos biaya {$data['name']} berhasil ditambahkan.",
        ], 201);
    }
}
