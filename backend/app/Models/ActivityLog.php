<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One recorded action by one account.
 *
 * Append-only: a row is written once by App\Support\ActivityLogger and is never
 * updated afterwards, which is what makes it usable as an audit trail.
 */
#[Fillable([
    'user_id',
    'actor_name',
    'actor_username',
    'actor_role',
    'action',
    'category',
    'description',
    'subject_type',
    'subject_id',
    'subject_label',
    'meta',
    'ip_address',
    'user_agent',
    'created_at',
])]
class ActivityLog extends Model
{
    /** The table carries a `created_at` stamp but has no `updated_at` column. */
    public $timestamps = false;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'meta' => 'array',
            'created_at' => 'datetime',
        ];
    }

    /** The account that acted, while it still exists. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}