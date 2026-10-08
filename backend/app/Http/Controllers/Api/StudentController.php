<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StudentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = DB::table('students')
            ->join('class_levels', 'class_levels.id', '=', 'students.class_level_id')
            ->where('students.is_active', true)
            ->select('students.*', 'class_levels.name as class_level');

        if ($request->filled('search')) {
            $term = '%'.$request->string('search')->toString().'%';
            $query->where(fn ($builder) => $builder->where('students.full_name', 'like', $term)
                ->orWhere('students.nisn', 'like', $term)
                ->orWhere('students.student_number', 'like', $term));
        }
        if ($request->filled('class_level_id')) {
            $query->where('students.class_level_id', $request->integer('class_level_id'));
        }

        return response()->json(['data' => $query->orderBy('students.full_name')->paginate(25)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'nisn' => ['required', 'string', 'max:20', 'unique:students,nisn'],
            'student_number' => ['required', 'string', 'max:30', 'unique:students,student_number'],
            'full_name' => ['required', 'string', 'max:255'],
            'class_level_id' => ['required', 'exists:class_levels,id'],
        ]);
        $id = DB::table('students')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));

        $student = DB::table('students')->where('students.id', $id)->join('class_levels', 'class_levels.id', '=', 'students.class_level_id')->select('students.*', 'class_levels.name as class_level')->first();

        ActivityLogger::record(
            'siswa.tambah',
            'siswa',
            "Menambah siswa {$student->full_name} ({$student->class_level}).",
            [
                'subject_type' => 'student',
                'subject_id' => $id,
                'subject_label' => $student->full_name,
                'meta' => [
                    'nisn' => $student->nisn,
                    'student_number' => $student->student_number,
                    'class_level' => $student->class_level,
                ],
            ],
        );

        return response()->json(['data' => $student], 201);
    }

    public function bills(Request $request, int $student): JsonResponse
    {
        $studentRow = DB::table('students')->where('id', $student)->first();
        abort_unless($studentRow, 404);
        $yearId = $request->integer('academic_year_id') ?: DB::table('academic_years')->where('is_active', true)->value('id');
        abort_unless($yearId, 422, 'Tahun ajaran aktif belum diatur.');
        $levelId = $studentRow->class_level_id;
        $year = DB::table('academic_years')->where('id', $yearId)->first();

        foreach (range(1, 12) as $month) {
            $period = DB::table('spp_periods')->where('academic_year_id', $yearId)
                ->where('class_level_id', $levelId)->where('month_start', '<=', $month)->where('month_end', '>=', $month)->first();
            if ($period) {
                DB::table('spp_bills')->where(['student_id' => $student, 'academic_year_id' => $yearId, 'month' => $month])->exists()
                    || DB::table('spp_bills')->insert([
                        'student_id' => $student, 'academic_year_id' => $yearId, 'month' => $month,
                        'calendar_year' => $month >= 7 ? $year->start_year : $year->end_year,
                        'amount' => $period->monthly_amount, 'created_at' => now(), 'updated_at' => now(),
                    ]);
            }
        }

        return response()->json([
            'data' => [
                'spp' => DB::table('spp_bills')->where('student_id', $student)->where('academic_year_id', $yearId)->orderByRaw('CASE WHEN month >= 7 THEN month - 6 ELSE month + 6 END')->get(),
                'non_spp' => DB::table('position_rates')
                    ->leftJoin('non_spp_bills', function ($join) use ($student) {
                        $join->on('position_rates.id', '=', 'non_spp_bills.position_rate_id')
                            ->where('non_spp_bills.student_id', '=', $student);
                    })
                    ->join('payment_positions', 'payment_positions.id', '=', 'position_rates.payment_position_id')
                    ->where('position_rates.academic_year_id', $yearId)
                    ->where('position_rates.class_level_id', $levelId)
                    ->where('payment_positions.is_active', true)
                    ->select([
                        'position_rates.id',
                        'position_rates.id as position_rate_id',
                        'non_spp_bills.id as bill_id',
                        DB::raw('COALESCE(non_spp_bills.amount_due, position_rates.amount) as amount_due'),
                        DB::raw('COALESCE(non_spp_bills.amount_paid, 0) as amount_paid'),
                        DB::raw("COALESCE(non_spp_bills.status, 'belum_bayar') as status"),
                        'payment_positions.name as position',
                    ])
                    ->get(),
            ],
        ]);
    }
}
