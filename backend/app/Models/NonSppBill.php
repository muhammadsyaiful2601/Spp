<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Per-student non-SPP bill against a position rate (instalment-capable).
 */
class NonSppBill extends Model
{
    protected $table = 'non_spp_bills';

    protected $fillable = [
        'student_id', 'position_rate_id', 'amount_due', 'amount_paid',
        'status',
    ];

    protected $casts = [
        'amount_due' => 'decimal:2',
        'amount_paid' => 'decimal:2',
    ];

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }
}
