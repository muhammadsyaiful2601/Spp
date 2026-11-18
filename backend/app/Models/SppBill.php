<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Per-student, per-month SPP bill generated against a pricing period.
 */
class SppBill extends Model
{
    protected $table = 'spp_bills';

    protected $fillable = [
        'student_id', 'academic_year_id', 'month', 'calendar_year',
        'amount', 'status', 'paid_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'month' => 'integer',
        'calendar_year' => 'integer',
        'paid_at' => 'datetime',
    ];

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }
}
