<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
use App\Support\PaymentTransactionQuery;
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

    /**
     * One student's payment history, so a mistake can be found and corrected
     * from the same screen the payment was recorded on.
     *
     * Scoped to the academic year the payment page is showing, because that is
     * the period the treasurer is looking at; a null year returns everything.
     */
    public function transactions(Request $request, string $student): JsonResponse
    {
        $studentId = (int) $student;
        $yearId = $request->integer('academic_year_id') ?: null;

        abort_unless(DB::table('students')->where('id', $studentId)->exists(), 404);

        $rows = PaymentTransactionQuery::forAcademicYear($yearId)
            ->where('payment_transactions.student_id', $studentId)
            ->orderByDesc('payment_transactions.paid_at')
            ->get([
                'payment_transactions.id',
                'payment_transactions.transaction_number',
                'payment_transactions.type',
                'payment_transactions.amount',
                'payment_transactions.paid_at',
                'payment_transactions.details',
            ]);

        return response()->json(['data' => $rows->map(function ($transaction) {
            $details = json_decode($transaction->details ?? '{}', true) ?: [];

            return [
                'id' => (int) $transaction->id,
                'number' => $transaction->transaction_number,
                'type' => $transaction->type,
                'detail' => PaymentTransactionQuery::describe($transaction->type, $transaction->details),
                // Calendar months this payment settled, so the correction form
                // can offer the same month grid the payment form uses.
                'months' => $transaction->type === 'spp'
                    ? collect($details['months'] ?? [])->map(fn ($month) => (int) $month)->values()
                    : [],
                'amount' => (float) $transaction->amount,
                'status' => 'Lunas',
                'paid_at' => $transaction->paid_at,
                'date' => PaymentTransactionQuery::formatDate($transaction->paid_at),
            ];
        })]);
    }

    /**
     * Correct a mis-keyed payment.
     *
     * Three things are editable, and each one only when it makes sense for the
     * payment: the date the money moved (always), the amount (non-SPP only),
     * and the months an SPP payment settled. Moving the months is what a
     * treasurer needs after picking the wrong month, and it reopens the months
     * the payment no longer covers — the bills have to follow the correction or
     * the arrears figure would count months nobody paid.
     *
     * An SPP amount is the sum of the bills it settled, so it is derived rather
     * than typed: it moves with the months and is never entered by hand.
     */
    public function update(Request $request, string $transactionNumber): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['sometimes', 'nullable', 'numeric', 'gt:0', 'max:9999999999.99'],
            'paid_at' => ['sometimes', 'nullable', 'date', 'before_or_equal:now'],
            'months' => ['sometimes', 'nullable', 'array', 'min:1', 'max:12'],
            'months.*' => ['required', 'integer', 'between:1,12', 'distinct'],
        ], [
            'amount.gt' => 'Jumlah pembayaran harus lebih besar dari nol.',
            'paid_at.before_or_equal' => 'Tanggal pembayaran tidak boleh di masa depan.',
        ]);

        $result = DB::transaction(function () use ($transactionNumber, $data) {
            $transaction = DB::table('payment_transactions')
                ->where('transaction_number', $transactionNumber)
                ->lockForUpdate()
                ->first();
            abort_unless($transaction, 404, 'Transaksi tidak ditemukan.');

            $beforeAmount = (float) $transaction->amount;
            $beforePaidAt = $transaction->paid_at;
            $beforeDetails = json_decode($transaction->details ?? '{}', true) ?: [];
            $update = [];
            $settledAt = $data['paid_at'] ?? $transaction->paid_at;

            if (array_key_exists('months', $data) && $data['months'] !== null) {
                abort_if(
                    $transaction->type !== 'spp',
                    422,
                    'Hanya pembayaran SPP yang punya daftar bulan untuk dikoreksi.'
                );

                $months = collect($data['months'])->sort()->values()->all();
                $previousBillIds = collect($beforeDetails['bill_ids'] ?? []);
                $student = DB::table('students')
                    ->where('id', $transaction->student_id)
                    ->lockForUpdate()
                    ->first();

                // `payment_transactions` carries no year of its own, so the year
                // comes from the bills this transaction already settled.
                $yearId = $previousBillIds->isNotEmpty()
                    ? DB::table('spp_bills')->whereIn('id', $previousBillIds)->value('academic_year_id')
                    : null;
                $yearId ??= DB::table('spp_bills')
                    ->where('student_id', $student->id)
                    ->orderByDesc('academic_year_id')
                    ->value('academic_year_id');
                abort_unless($yearId, 422, 'Tagihan SPP siswa ini belum pernah dibuat.');

                $bills = [];
                foreach ($months as $month) {
                    $period = DB::table('spp_periods')->where('academic_year_id', $yearId)
                        ->where('class_level_id', $student->class_level_id)
                        ->where('month_start', '<=', $month)->where('month_end', '>=', $month)
                        ->first();
                    abort_unless($period, 422, "Tarif SPP bulan {$month} belum diatur untuk kelas siswa.");

                    $bill = DB::table('spp_bills')->where([
                        'student_id' => $student->id, 'academic_year_id' => $yearId, 'month' => $month,
                    ])->lockForUpdate()->first();

                    // A month settled by another payment cannot be moved here:
                    // that payment's own bill would then have to be reopened.
                    abort_if(
                        $bill?->status === 'lunas' && ! $previousBillIds->contains($bill->id),
                        422,
                        'Bulan '.PaymentTransactionQuery::monthLabel((int) $month).' sudah lunas lewat pembayaran lain.'
                    );

                    if (! $bill) {
                        $billId = DB::table('spp_bills')->insertGetId([
                            'student_id' => $student->id,
                            'academic_year_id' => $yearId,
                            'month' => $month,
                            'calendar_year' => $month >= 7 ? DB::table('academic_years')->where('id', $yearId)->value('start_year') : DB::table('academic_years')->where('id', $yearId)->value('end_year'),
                            'amount' => $period->monthly_amount,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                        $bill = DB::table('spp_bills')->find($billId);
                    }
                    $bills[] = $bill;
                }

                // Months this payment used to settle but no longer does go back
                // to being owed. A bill is only ever settled once — `paySpp`
                // refuses an already-lunas month — so no other transaction can
                // be holding it.
                DB::table('spp_bills')->whereIn('id', $previousBillIds->diff(collect($bills)->pluck('id')))
                    ->update(['status' => 'belum_bayar', 'paid_at' => null, 'updated_at' => now()]);

                DB::table('spp_bills')->whereIn('id', collect($bills)->pluck('id'))->update([
                    'status' => 'lunas', 'paid_at' => $settledAt, 'updated_at' => now(),
                ]);

                // The amount is the sum of the months, never typed by hand, so
                // moving months moves the money with them.
                $update['amount'] = collect($bills)->sum('amount');
                $update['reference_id'] = $bills[0]->id;
                $update['details'] = json_encode([
                    'bill_ids' => collect($bills)->pluck('id'),
                    'months' => $months,
                ]);
            }

            if (array_key_exists('amount', $data) && $data['amount'] !== null) {
                abort_if(
                    $transaction->type === 'spp',
                    422,
                    'Nominal SPP mengikuti tagihan bulan yang dibayar — koreksi bulan, bukan nominal.'
                );

                $bill = DB::table('non_spp_bills')
                    ->where('id', $transaction->reference_id)
                    ->lockForUpdate()
                    ->first();
                abort_unless($bill, 422, 'Tagihan biaya ini tidak ditemukan.');

                // The position may have been settled in instalments, so the
                // ceiling for this payment is what the position still owes
                // *excluding* it.
                $otherPayments = (float) DB::table('payment_transactions')
                    ->where('type', 'non_spp')
                    ->where('reference_id', $bill->id)
                    ->where('id', '!=', $transaction->id)
                    ->sum('amount');
                $ceiling = (float) $bill->amount_due - $otherPayments;

                abort_if($ceiling <= 0, 422, 'Pos biaya ini sudah lunas tanpa pembayaran ini.');
                abort_if(
                    (float) $data['amount'] > $ceiling,
                    422,
                    'Jumlah melebihi sisa tagihan pos biaya setelah dikoreksi.'
                );

                $paid = $otherPayments + (float) $data['amount'];
                DB::table('non_spp_bills')->where('id', $bill->id)->update([
                    'amount_paid' => $paid,
                    'status' => $paid >= (float) $bill->amount_due ? 'lunas' : 'sebagian',
                    'updated_at' => now(),
                ]);

                $update['amount'] = (float) $data['amount'];
            }

            if (! empty($data['paid_at'])) {
                $update['paid_at'] = $data['paid_at'];
            }

            if ($update !== []) {
                $update['updated_at'] = now();
                DB::table('payment_transactions')->where('id', $transaction->id)->update($update);
            }

            return [
                'transaction' => DB::table('payment_transactions')->find($transaction->id),
                'student' => DB::table('students')->where('id', $transaction->student_id)->value('full_name'),
                'before' => [
                    'amount' => $beforeAmount,
                    'paid_at' => $beforePaidAt,
                    'months' => $beforeDetails['months'] ?? [],
                ],
            ];
        });

        $afterDetails = json_decode($result['transaction']->details ?? '{}', true) ?: [];
        $changes = [];
        if ((float) $result['transaction']->amount !== $result['before']['amount']) {
            $changes[] = 'nominal Rp '.$result['before']['amount'].' menjadi Rp '.$result['transaction']->amount;
        }
        if ($result['transaction']->paid_at !== $result['before']['paid_at']) {
            $changes[] = 'tanggal pembayaran';
        }
        if (($afterDetails['months'] ?? []) !== ($result['before']['months'] ?? [])) {
            $changes[] = 'bulan dibayar menjadi '
                .collect($afterDetails['months'] ?? [])
                    ->map(fn ($month) => PaymentTransactionQuery::monthLabel((int) $month))
                    ->implode(', ');
        }

        // Best-effort audit trail: a silent failure here must not lose the
        // correction itself, so the exception is swallowed by the logger.
        ActivityLogger::record(
            'pembayaran.koreksi',
            'pembayaran',
            "Merekoreksi pembayaran {$transactionNumber} untuk {$result['student']}"
                .($changes === [] ? '.' : ' ('.implode(' dan ', $changes).').'),
            [
                'subject_type' => 'student',
                'subject_id' => (int) $result['transaction']->student_id,
                'subject_label' => $result['student'],
                'meta' => [
                    'transaction_number' => $transactionNumber,
                    'amount' => (float) $result['transaction']->amount,
                    'amount_sebelumnya' => $result['before']['amount'],
                    'paid_at' => $result['transaction']->paid_at,
                    'paid_at_sebelumnya' => $result['before']['paid_at'],
                ],
            ],
        );

        return response()->json(['data' => $result['transaction']]);
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
