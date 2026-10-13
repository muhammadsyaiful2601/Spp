<?php

namespace App\Support;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * One definition of "the payments belonging to an academic year".
 *
 * `payment_transactions` carries no `academic_year_id` of its own. The year has
 * to be derived from the bill a transaction settled: for SPP that is
 * `spp_bills.academic_year_id`, for everything else it is the academic year of
 * the position rate behind `non_spp_bills`.
 *
 * That derivation is subtle enough to be worth having exactly once. The
 * dashboard totals and the reports read the same money, so if one of them
 * re-derives the year slightly differently they can disagree over the same
 * figures — a report that totals more (or less) than the dashboard it is
 * supposed to explain. Both go through here so they cannot drift.
 */
final class PaymentTransactionQuery
{
    /** Base table, unscoped. */
    public static function base(): Builder
    {
        return DB::table('payment_transactions');
    }

    /**
     * Payments limited to one academic year.
     *
     * A null year means "do not scope by year at all" rather than "no results",
     * so callers that have no year on hand still get every transaction.
     */
    public static function forAcademicYear(?int $academicYearId): Builder
    {
        $query = self::base();

        if ($academicYearId === null) {
            return $query;
        }

        return $query->where(function (Builder $query) use ($academicYearId) {
            $query->where(function (Builder $spp) use ($academicYearId) {
                $spp->where('payment_transactions.type', 'spp')
                    ->whereIn('payment_transactions.reference_id', DB::table('spp_bills')
                        ->select('id')
                        ->where('academic_year_id', $academicYearId));
            })->orWhere(function (Builder $nonSpp) use ($academicYearId) {
                $nonSpp->where('payment_transactions.type', 'non_spp')
                    ->whereIn('payment_transactions.reference_id', DB::table('non_spp_bills')
                        ->join('position_rates', 'position_rates.id', '=', 'non_spp_bills.position_rate_id')
                        ->where('position_rates.academic_year_id', $academicYearId)
                        ->select('non_spp_bills.id'));
            });
        });
    }

    /**
     * Human label for a transaction, matching what the portal and reports show.
     *
     * SPP transactions only store month numbers in `details`, so the label has
     * to be rebuilt from them; other fees carry their position name directly.
     */
    public static function describe(?string $type, ?string $detailsJson): string
    {
        $details = json_decode($detailsJson ?? '{}', true) ?: [];

        if ($type === 'spp') {
            $months = collect($details['months'] ?? [])
                ->map(fn ($month) => self::monthLabel((int) $month));

            return $months->isEmpty()
                ? 'SPP'
                : 'SPP · '.$months->implode(', ');
        }

        return $details['position'] ?? 'Biaya lain';
    }

    /** Indonesian month name for a calendar month number (1..12). */
    public static function monthLabel(int $month): string
    {
        $names = [
            1 => 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
        ];

        return $names[$month] ?? (string) $month;
    }

    /**
     * Absolute timestamp for a printed document.
     *
     * Deliberately not relative: "2 jam lalu" is fine on a dashboard but wrong
     * on a receipt or a report, where the reader needs the date the money moved.
     */
    public static function formatDate(?string $paidAt): string
    {
        if (! $paidAt) {
            return '-';
        }

        $date = \Illuminate\Support\Carbon::parse($paidAt);
        $months = [1 => 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

        return sprintf(
            '%d %s %s, %s',
            $date->day,
            $months[(int) $date->format('n')],
            $date->year,
            $date->format('H.i'),
        );
    }
}