/**
 * Derived dashboard metrics.
 *
 * The month grid is in academic order (0 = Jul ... 11 = Jun), so any
 * "current month" lookup must be translated from the calendar month before it
 * can index into `monthlyRevenue`.
 */

import { months } from "../constants";

/**
 * Translate a calendar month (1-12) into its academic-grid index (0-11).
 * July (7) starts the academic year at index 0; June (6) ends it at index 11.
 */
export function academicMonthIndex(date: Date): number {
  const month = date.getMonth() + 1;
  return month >= 7 ? month - 7 : month + 5;
}

/** Human label for an academic index, e.g. index 3 -> "Okt 2026". */
export function academicMonthLabel(index: number, startYear: number): string {
  const year = index < 6 ? startYear : startYear + 1;
  return `${months[index] ?? "?"} ${year}`;
}

/** Format a ratio as Indonesian percent text, e.g. 12.8 -> "12,8%". */
export function percentText(value: number): string {
  return `${new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

export type Trend = {
  /** Academic-grid index of the month now being collected. */
  currentIndex: number;
  current: number;
  /** Previous month, or null when the current month opens the academic year. */
  previous: number | null;
  /** Percentage change, or null when no meaningful comparison exists. */
  percent: number | null;
  direction: "up" | "down" | "flat";
  /** Ready-to-render "12,8%" string, or an em dash when undefined. */
  label: string;
  /** Explains what the trend compares, e.g. "Okt 2026 vs Sep 2026". */
  period: string;
};

/**
 * Compare the running month against the previous one.
 *
 * Returns `percent: null` when the current month is the first of the academic
 * year or when the previous month has no receipts, because dividing by zero
 * would otherwise render an infinite or misleading percentage.
 */
export function revenueTrend(
  monthlyRevenue: number[],
  now: Date,
  startYear: number,
): Trend {
  const currentIndex = academicMonthIndex(now);
  const current = monthlyRevenue[currentIndex] ?? 0;
  const previousIndex = currentIndex - 1;
  const previous = previousIndex >= 0 ? (monthlyRevenue[previousIndex] ?? 0) : null;

  const percent =
    previous !== null && previous > 0 ? ((current - previous) / previous) * 100 : null;

  const direction =
    percent === null || Math.abs(percent) < 0.05 ? "flat" : percent > 0 ? "up" : "down";

  const currentLabel = academicMonthLabel(currentIndex, startYear);
  const period =
    previous === null
      ? currentLabel
      : `${currentLabel} vs ${academicMonthLabel(previousIndex, startYear)}`;

  return {
    currentIndex,
    current,
    previous,
    percent,
    direction,
    label: percent === null ? "—" : percentText(Math.abs(percent)),
    period,
  };
}

/** Last calendar day of the month `date` falls in, e.g. 31 for October. */
export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}