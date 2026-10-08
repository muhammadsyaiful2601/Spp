<?php

namespace App\Support;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Throwable;

/**
 * Single entry point for writing the audit trail.
 *
 * Design rules:
 *  - Recording is best-effort. An audit that can take a payment request down
 *    with it is worse than a missing row, so every failure is swallowed and
 *    reported instead of thrown.
 *  - Callers record *after* the change succeeded, never before, so the log only
 *    ever describes work that actually happened.
 *  - Descriptions are written in Indonesian here rather than in the UI, so the
 *    stored row stays meaningful on its own (exports, support, direct queries).
 */
final class ActivityLogger
{
    /** Canonical ordering and labels for the filter chips. */
    public const CATEGORY_LABELS = [
        'akun' => 'Akun & keamanan',
        'pembayaran' => 'Pembayaran',
        'siswa' => 'Data siswa',
        'bendahara' => 'Kelola bendahara',
        'tarif' => 'Tarif & pos biaya',
        'tahun_ajaran' => 'Tahun ajaran',
        'profil_sekolah' => 'Profil sekolah',
        'sistem' => 'Pemeliharaan sistem',
    ];

    /**
     * Write one log row.
     *
     * @param  string  $action  Machine key, e.g. `pembayaran.spp`.
     * @param  string  $category  Grouping key, see CATEGORY_LABELS.
     * @param  string  $description  Human-readable summary, already in Indonesian.
     * @param  array{
     *     actor?: User|null,
     *     subject_type?: string|null,
     *     subject_id?: int|string|null,
     *     subject_label?: string|null,
     *     meta?: array<string, mixed>|null,
     * }  $options
     */
    public static function record(
        string $action,
        string $category,
        string $description,
        array $options = [],
    ): ?ActivityLog {
        try {
            // An explicit `actor` is how the anonymous flows (forgot / reset
            // password) attribute a row; everything else uses the session.
            $actor = array_key_exists('actor', $options) ? $options['actor'] : Auth::user();

            return ActivityLog::create([
                'user_id' => $actor?->getKey(),
                'actor_name' => $actor?->name,
                'actor_username' => $actor?->username,
                'actor_role' => $actor?->role,
                'action' => $action,
                'category' => $category,
                'description' => Str::limit($description, 250, ''),
                'subject_type' => $options['subject_type'] ?? null,
                'subject_id' => isset($options['subject_id']) ? (int) $options['subject_id'] : null,
                'subject_label' => isset($options['subject_label'])
                    ? Str::limit((string) $options['subject_label'], 250, '')
                    : null,
                'meta' => $options['meta'] ?? null,
                'ip_address' => request()?->ip(),
                'user_agent' => Str::limit((string) request()?->userAgent(), 250, ''),
                'created_at' => now(),
            ]);
        } catch (Throwable $exception) {
            // Never let auditing break the request it is describing.
            report($exception);

            return null;
        }
    }
}
