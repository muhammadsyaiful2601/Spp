<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PaymentController extends Controller
{
    public function paySpp(Request $request): JsonResponse
    {
        $data = $request->validate([
            'student_id' => ['required', 'exists:students,id'],
            'academic_year_id' => ['required', 'exists:academic_years,id'],
            'months' => ['required', 'array', 'min:1', 'max:12'],
            'months.*' => ['required', 'integer', 'between:1,12', 'distinct'],
        ]);

        $transaction = DB::transaction(function () use ($request, $data) {
            $student = DB::table('students')->where('id', $data['student_id'])->lockForUpdate()->first();
            $year = DB::table('academic_years')->where('id', $data['academic_year_id'])->first();
            $bills = [];

            foreach ($data['months'] as $month) {
                $period = DB::table('spp_periods')->where('academic_year_id', $year->id)
                    ->where('class_level_id', $student->class_level_id)
                    ->where('month_start', '<=', $month)->where('month_end', '>=', $month)->first();
                abort_unless($period, 422, "Tarif SPP bulan {$month} belum diatur untuk kelas siswa.");

                $bill = DB::table('spp_bills')->where([
                    'student_id' => $student->id, 'academic_year_id' => $year->id, 'month' => $month,
                ])->lockForUpdate()->first();
                abort_if($bill?->status === 'lunas', 422, "Tagihan bulan {$month} sudah lunas.");

                if (! $bill) {
                    $billId = DB::table('spp_bills')->insertGetId([
                        'student_id' => $student->id,
                        'academic_year_id' => $year->id,
                        'month' => $month,
                        'calendar_year' => $month >= 7 ? $year->start_year : $year->end_year,
                        'amount' => $period->monthly_amount,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $bill = DB::table('spp_bills')->find($billId);
                }
                $bills[] = $bill;
            }

            $number = 'SPP-'.now()->format('Ymd').'-'.Str::upper(Str::random(6));
            $amount = collect($bills)->sum('amount');
            $transactionId = DB::table('payment_transactions')->insertGetId([
                'transaction_number' => $number,
                'student_id' => $student->id,
                'user_id' => $request->user()->id,
                'type' => 'spp',
                'reference_id' => $bills[0]->id,
                'details' => json_encode(['bill_ids' => collect($bills)->pluck('id'), 'months' => $data['months']]),
                'amount' => $amount,
                'paid_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('spp_bills')->whereIn('id', collect($bills)->pluck('id'))->update([
                'status' => 'lunas', 'paid_at' => now(), 'updated_at' => now(),
            ]);

            return DB::table('payment_transactions')->find($transactionId);
        });

        $studentName = (string) DB::table('students')->where('id', $data['student_id'])->value('full_name');

        ActivityLogger::record(
            'pembayaran.spp',
            'pembayaran',
            "Mencatat pembayaran SPP untuk {$studentName} (".count($data['months']).' bulan).',
            [
                'subject_type' => 'student',
                'subject_id' => $data['student_id'],
                'subject_label' => $studentName,
                // Raw values only: the client owns currency and period formatting.
                'meta' => [
                    'transaction_number' => $transaction->transaction_number,
                    'amount' => (float) $transaction->amount,
                    'months' => $data['months'],
                ],
            ],
        );

        return response()->json(['data' => $transaction], 201);
    }

    public function payNonSpp(Request $request): JsonResponse
    {
        $data = $request->validate([
            'student_id' => ['required', 'exists:students,id'],
            'position_rate_id' => ['required', 'exists:position_rates,id'],
            'amount' => ['required', 'numeric', 'gt:0', 'max:9999999999.99'],
        ]);

        $transaction = DB::transaction(function () use ($request, $data) {
            $student = DB::table('students')->where('id', $data['student_id'])->lockForUpdate()->first();
            $rate = DB::table('position_rates')->join('payment_positions', 'payment_positions.id', '=', 'position_rates.payment_position_id')
                ->where('position_rates.id', $data['position_rate_id'])
                ->where('position_rates.class_level_id', $student->class_level_id)
                ->where('payment_positions.is_active', true)
                ->select('position_rates.*', 'payment_positions.name as position_name', 'payment_positions.type as position_type')->first();
            abort_unless($rate, 422, 'Pos biaya tidak aktif atau tidak berlaku untuk tingkat kelas siswa.');

            $bill = DB::table('non_spp_bills')->where([
                'student_id' => $student->id, 'position_rate_id' => $rate->id,
            ])->lockForUpdate()->first();
            if (! $bill) {
                $billId = DB::table('non_spp_bills')->insertGetId([
                    'student_id' => $student->id, 'position_rate_id' => $rate->id,
                    'amount_due' => $rate->amount, 'amount_paid' => 0,
                    'status' => 'belum_bayar', 'created_at' => now(), 'updated_at' => now(),
                ]);
                $bill = DB::table('non_spp_bills')->find($billId);
            }

            $remaining = (float) $bill->amount_due - (float) $bill->amount_paid;
            abort_if($remaining <= 0, 422, 'Pos biaya ini sudah lunas.');
            abort_if((float) $data['amount'] > $remaining, 422, 'Jumlah pembayaran melebihi sisa tagihan.');
            abort_if($rate->position_type !== 'cicilan' && (float) $data['amount'] !== $remaining, 422, 'Pos ini harus dibayar lunas sekaligus.');

            $paid = (float) $bill->amount_paid + (float) $data['amount'];
            DB::table('non_spp_bills')->where('id', $bill->id)->update([
                'amount_paid' => $paid, 'status' => $paid >= (float) $bill->amount_due ? 'lunas' : 'sebagian', 'updated_at' => now(),
            ]);
            $number = 'NSP-'.now()->format('Ymd').'-'.Str::upper(Str::random(6));
            $id = DB::table('payment_transactions')->insertGetId([
                'transaction_number' => $number, 'student_id' => $student->id,
                'user_id' => $request->user()->id, 'type' => 'non_spp', 'reference_id' => $bill->id,
                'details' => json_encode(['position' => $rate->position_name, 'position_rate_id' => $rate->id]),
                'amount' => $data['amount'], 'paid_at' => now(), 'created_at' => now(), 'updated_at' => now(),
            ]);

            return DB::table('payment_transactions')->find($id);
        });

        $studentName = (string) DB::table('students')->where('id', $data['student_id'])->value('full_name');
        $positionName = (string) DB::table('position_rates')
            ->join('payment_positions', 'payment_positions.id', '=', 'position_rates.payment_position_id')
            ->where('position_rates.id', $data['position_rate_id'])
            ->value('payment_positions.name');

        ActivityLogger::record(
            'pembayaran.non_spp',
            'pembayaran',
            "Mencatat pembayaran non-SPP {$positionName} untuk {$studentName}.",
            [
                'subject_type' => 'student',
                'subject_id' => $data['student_id'],
                'subject_label' => $studentName,
                'meta' => [
                    'transaction_number' => $transaction->transaction_number,
                    'position' => $positionName,
                    'amount' => (float) $transaction->amount,
                ],
            ],
        );

        return response()->json(['data' => $transaction], 201);
    }

    public function receipt(string $transactionNumber): JsonResponse
    {
        $transaction = DB::table('payment_transactions')->join('students', 'students.id', '=', 'payment_transactions.student_id')
            ->join('class_levels', 'class_levels.id', '=', 'students.class_level_id')
            ->where('payment_transactions.transaction_number', $transactionNumber)
            ->select('payment_transactions.*', 'students.full_name', 'students.student_number', 'class_levels.name as class_level')->first();
        abort_unless($transaction, 404);

        return response()->json(['data' => [
            'school' => DB::table('school_profiles')->first(),
            'transaction' => $transaction,
        ]]);
    }
}
