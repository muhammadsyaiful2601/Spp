<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Academic year management.
 *
 * A year is only useful once it owns SPP periods and non-SPP tariffs, so creating
 * one can copy those rates from an existing year. Activating a year is what the
 * portal defaults to when the client does not ask for a specific one.
 */
class AcademicYearController extends Controller
{
    /** List every year with enough context for the switcher to stay informative. */
    public function index(): JsonResponse
    {
        $years = DB::table('academic_years')
            ->orderByDesc('start_year')
            ->get()
            ->map(fn ($year) => [
                'id' => (int) $year->id,
                'name' => $year->name,
                'start_year' => (int) $year->start_year,
                'end_year' => (int) $year->end_year,
                'is_active' => (bool) $year->is_active,
                'students_count' => DB::table('spp_bills')
                    ->where('academic_year_id', $year->id)->distinct()->count('student_id'),
                'bills_count' => DB::table('spp_bills')
                    ->where('academic_year_id', $year->id)->count(),
                'received' => (float) DB::table('payment_transactions')
                    ->whereBetween('paid_at', [
                        "{$year->start_year}-07-01 00:00:00",
                        "{$year->end_year}-06-30 23:59:59",
                    ])->sum('amount'),
                // A year with no tariff rows would silently render as Rp 0.
                'has_tariffs' => DB::table('spp_periods')
                    ->where('academic_year_id', $year->id)->exists(),
            ]);

        return response()->json(['data' => $years]);
    }

    /**
     * Create a year, optionally cloning SPP periods and non-SPP tariffs from an
     * existing year so the new one is immediately usable.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'start_year' => ['required', 'integer', 'min:2000', 'max:2100'],
            'end_year' => ['required', 'integer', 'min:2000', 'max:2100'],
            'name' => ['sometimes', 'string', 'max:20'],
            'is_active' => ['sometimes', 'boolean'],
            'copy_from' => ['nullable', 'integer', 'exists:academic_years,id'],
        ]);

        if ((int) $data['end_year'] !== (int) $data['start_year'] + 1) {
            $message = 'Tahun akhir harus satu tahun setelah tahun mulai.';

            return response()->json([
                'message' => $message,
                'errors' => ['end_year' => [$message]],
            ], 422);
        }

        $startYear = (int) $data['start_year'];
        $endYear = (int) $data['end_year'];
        $name = $data['name'] ?? "{$startYear}/{$endYear}";

        if (DB::table('academic_years')->where('name', $name)->exists()) {
            return response()->json([
                'message' => "Tahun ajaran {$name} sudah ada.",
                'errors' => ['name' => ["Tahun ajaran {$name} sudah ada."]],
            ], 422);
        }

        $copyFrom = $data['copy_from'] ?? null;
        $makeActive = (bool) ($data['is_active'] ?? false);

        $yearId = DB::transaction(function () use ($name, $startYear, $endYear, $copyFrom, $makeActive) {
            $yearId = (int) DB::table('academic_years')->insertGetId([
                'name' => $name,
                'start_year' => $startYear,
                'end_year' => $endYear,
                'is_active' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            if ($copyFrom !== null) {
                $this->copyTariffs((int) $copyFrom, $yearId);
            }

            if ($makeActive) {
                $this->activateYear($yearId);
            }

            return $yearId;
        });

        ActivityLogger::record(
            'tahun_ajaran.buat',
            'tahun_ajaran',
            "Membuat tahun ajaran {$name}"
                .($copyFrom !== null ? ' dengan salinan tarif dari tahun sebelumnya' : '')
                .($makeActive ? ' dan mengaktifkannya' : '').'.',
            [
                'subject_type' => 'academic_year',
                'subject_id' => $yearId,
                'subject_label' => $name,
                'meta' => [
                    'start_year' => $startYear,
                    'end_year' => $endYear,
                    'is_active' => $makeActive,
                    'copy_from' => $copyFrom,
                ],
            ],
        );

        return response()->json([
            'data' => [
                'id' => $yearId, 'name' => $name, 'start_year' => $startYear,
                'end_year' => $endYear, 'is_active' => $makeActive,
            ],
            'message' => "Tahun ajaran {$name} berhasil dibuat.",
        ], 201);
    }

    /** Make one year active; every other year is demoted in the same transaction. */
    public function activate(int $year): JsonResponse
    {
        // One lookup serves both the existence check and the log description.
        $yearName = DB::table('academic_years')->where('id', $year)->value('name');

        abort_if(! $yearName, 404, 'Tahun ajaran tidak ditemukan.');

        DB::transaction(fn () => $this->activateYear($year));

        ActivityLogger::record(
            'tahun_ajaran.aktifkan',
            'tahun_ajaran',
            "Mengaktifkan tahun ajaran {$yearName}.",
            [
                'subject_type' => 'academic_year',
                'subject_id' => $year,
                'subject_label' => $yearName,
            ],
        );

        return response()->json([
            'data' => ['id' => $year, 'is_active' => true],
            'message' => 'Tahun ajaran aktif berhasil diperbarui.',
        ]);
    }

    /** Promote a year to active without touching any other table. */
    private function activateYear(int $yearId): void
    {
        DB::table('academic_years')->update(['is_active' => false, 'updated_at' => now()]);
        DB::table('academic_years')->where('id', $yearId)->update([
            'is_active' => true,
            'updated_at' => now(),
        ]);
    }

    /**
     * Duplicate the source year's SPP periods and non-SPP tariffs onto the new
     * year. Amounts are copied verbatim so they can be reviewed and adjusted
     * afterwards from the settings screen.
     */
    private function copyTariffs(int $sourceYearId, int $targetYearId): void
    {
        foreach (DB::table('spp_periods')->where('academic_year_id', $sourceYearId)->get() as $period) {
            DB::table('spp_periods')->insert([
                'academic_year_id' => $targetYearId,
                'class_level_id' => $period->class_level_id,
                'name' => $period->name,
                'month_start' => $period->month_start,
                'month_end' => $period->month_end,
                'monthly_amount' => $period->monthly_amount,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        foreach (DB::table('position_rates')->where('academic_year_id', $sourceYearId)->get() as $rate) {
            DB::table('position_rates')->insert([
                'payment_position_id' => $rate->payment_position_id,
                'academic_year_id' => $targetYearId,
                'class_level_id' => $rate->class_level_id,
                'amount' => $rate->amount,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }
}