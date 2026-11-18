<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A recorded payment against a student's bill.
 *
 * `reference_id` points at `spp_bills.id` for SPP payments or
 * `non_spp_bills.id` for everything else. The academic year is derived
 * from the referenced bill, not stored on this row.
 */
class PaymentTransaction extends Model
{
    protected $table = 'payment_transactions';

    protected $fillable = [
        'transaction_number', 'student_id', 'user_id', 'type',
        'reference_id', 'details', 'amount', 'paid_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'paid_at' => 'datetime',
        'details' => 'array',
    ];

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
