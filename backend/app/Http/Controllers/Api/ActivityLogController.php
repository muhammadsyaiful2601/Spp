<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Support\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * View over the audit trail, for `pimpinan` only.
 *
 * The log is append-only: there is no create/update route here, because a trail
 * the person being audited can edit is not a trail. Erasing the whole table is
 * the single exception — see `destroy()` for why it exists and for the one thing
 * it deliberately cannot remove.
 */
class ActivityLogController extends Controller
{
    /**
     * Paginated, filterable list of recorded actions.
     *
     * `summary` carries whole-table headline numbers and a per-category facet
     * count, so the filter control can show how many rows each option holds
     * without a second request.
     */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'category' => ['nullable', 'string', 'max:30'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        // Search and the date range define one shared scope. The category facet
        // is counted from this scope *without* the category filter, so every
        // option keeps a number while one of them is selected.
        $base = fn () => ActivityLog::query()
            ->when(filled($data['search'] ?? null), function ($query) use ($data) {
                $term = '%'.trim((string) $data['search']).'%';
                $query->where(fn ($inner) => $inner
                    ->where('description', 'like', $term)
                    ->orWhere('action', 'like', $term)
                    ->orWhere('actor_name', 'like', $term)
                    ->orWhere('actor_username', 'like', $term)
                    ->orWhere('subject_label', 'like', $term));
            })
            ->when(filled($data['from'] ?? null), fn ($query) => $query->whereDate('created_at', '>=', $data['from']))
            ->when(filled($data['to'] ?? null), fn ($query) => $query->whereDate('created_at', '<=', $data['to']));

        $byCategory = $base()
            ->selectRaw('category, count(*) as aggregate')
            ->groupBy('category')
            ->pluck('aggregate', 'category');

        $perPage = (int) ($data['per_page'] ?? 20);

        // `created_at` alone is not a total order — a bulk action writes several
        // rows in the same second, so `id` is the tie-breaker that keeps
        // pagination stable between requests.
        $logs = $base()
            ->when(filled($data['category'] ?? null), fn ($query) => $query->where('category', $data['category']))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($perPage);

        return response()->json([
            'data' => collect($logs->items())
                ->map(fn (ActivityLog $log) => $this->present($log))
                ->all(),
            'meta' => [
                'page' => $logs->currentPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
                'last_page' => $logs->lastPage(),
            ],
            'summary' => [
                // Headline figures cover the whole table; they must not move when
                // a filter is applied.
                'total' => ActivityLog::query()->count(),
                'today' => ActivityLog::query()->whereDate('created_at', today())->count(),
                'actors' => ActivityLog::query()->whereNotNull('actor_username')->distinct()->count('actor_username'),
                // Rows matching the current search + date scope.
                'filtered' => $logs->total(),
                'by_category' => $byCategory,
            ],
            'categories' => $this->categories(),
        ]);
    }

    /**
     * Erase the whole audit trail.
     *
     * The table is written to by every mutation — roughly one to three rows per
     * request — and was never given a retention job, so on a shared-hosting
     * database it grows until the listing query starts to crawl. Trimming by age
     * is not enough on its own because it still needs someone to press the
     * button; this is the deliberate way out, and it is kept to `pimpinan`
     * because that is the only role that reads the trail anyway.
     *
     * What this cannot do is leave no evidence. The deletion is recorded as a
     * row of its own *after* the table is emptied, so "who emptied the log, when,
     * and how much was in it" survives. An erasure that erased its own receipt
     * would be indistinguishable from never having happened.
     *
     * There is no confirmation-by-value on the API side: the client already
     * asks, and a second secret prompt would only mean the value gets logged
     * somewhere else.
     */
    public function destroy(): JsonResponse
    {
        // Bulk delete rather than Eloquent's: no model events fire on this table
        // by design, and `delete()` returns the affected count in one pass.
        $deleted = DB::table('activity_logs')->delete();

        ActivityLogger::record(
            'akun.log_dibersihkan',
            'akun',
            "Menghapus seluruh log aktivitas ({$deleted} baris).",
            ['meta' => ['deleted_rows' => $deleted]],
        );

        return response()->json([
            'message' => "Log aktivitas berhasil dihapus ({$deleted} baris).",
            'data' => ['deleted' => $deleted],
        ]);
    }

    /**
     * Every category the filter can offer, canonical groups first so the control
     * reads the same on every visit.
     *
     * Any category found only in the data is still listed, so a value written by
     * an older build can never become unreachable.
     */
    private function categories(): array
    {
        $present = ActivityLog::query()->distinct()->pluck('category')->all();

        $ordered = array_values(array_unique(array_merge(
            array_keys(ActivityLogger::CATEGORY_LABELS),
            $present,
        )));

        return array_map(fn (string $value) => [
            'value' => $value,
            'label' => ActivityLogger::CATEGORY_LABELS[$value] ?? Str::headline($value),
        ], $ordered);
    }

    /** Shape one row for the API. */
    private function present(ActivityLog $log): array
    {
        return [
            'id' => $log->id,
            'action' => $log->action,
            'category' => $log->category,
            'category_label' => ActivityLogger::CATEGORY_LABELS[$log->category]
                ?? Str::headline((string) $log->category),
            'description' => $log->description,
            'actor' => [
                'id' => $log->user_id,
                'name' => $log->actor_name,
                'username' => $log->actor_username,
                'role' => $log->actor_role,
                'role_label' => $this->roleLabel($log->actor_role),
            ],
            'subject' => $log->subject_type === null ? null : [
                'type' => $log->subject_type,
                'id' => $log->subject_id,
                'label' => $log->subject_label,
            ],
            // Amounts and other numbers travel as raw values: the client owns
            // currency formatting, so there is exactly one Rupiah formatter.
            'details' => $log->meta ?? [],
            'ip_address' => $log->ip_address,
            // ISO 8601, formatted on the client so the row follows the viewer's
            // locale rather than the server's timezone settings.
            'created_at' => $log->created_at?->toIso8601String(),
        ];
    }

    /** Display name for the role that performed the action. */
    private function roleLabel(?string $role): string
    {
        return match ($role) {
            'pimpinan' => 'Pimpinan',
            'admin' => 'Bendahara',
            default => 'Sistem',
        };
    }
}
