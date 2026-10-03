/**
 * Session lifetime tracking.
 *
 * The portal stores its token in localStorage so a tab survives a restart, which
 * also means a forgotten browser stays signed in forever. This module keeps a
 * last-seen timestamp alongside it and lets the app end the session once the
 * user has been idle for too long.
 *
 * The timestamp lives in localStorage rather than component state so it survives
 * a page reload — otherwise a refresh would silently reset the idle clock.
 */

const ACTIVITY_KEY = "cendekia-last-activity";

/**
 * Idle limit in minutes.
 *
 * Fifteen is short enough to protect a shared office machine — a treasurer who
 * walks away from an unlocked desk should not leave payment access behind —
 * but long enough to finish recording a batch of receipts. Set
 * `VITE_SESSION_IDLE_MINUTES` to tune it without touching the code.
 */
const IDLE_LIMIT_MINUTES = Number(import.meta.env.VITE_SESSION_IDLE_MINUTES ?? 15);

/** How often the idle state is re-checked, in milliseconds. */
export const IDLE_CHECK_INTERVAL = 15_000;

/**
 * Warn this long before expiry.
 *
 * At a 15 minute limit a silent sign-out would come as a surprise, so the
 * portal counts down and offers to stay signed in.
 */
export const IDLE_WARNING_MS = 2 * 60_000;

/** A bad or zero value must not disable the timeout entirely. */
const RESOLVED_IDLE_MS =
  Number.isFinite(IDLE_LIMIT_MINUTES) && IDLE_LIMIT_MINUTES > 0
    ? IDLE_LIMIT_MINUTES * 60_000
    : 15 * 60_000;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Record that the user is present, restarting the idle countdown. */
export function touchSession(): void {
  try {
    storage()?.setItem(ACTIVITY_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Start a fresh idle window. Call right after signing in. */
export function startSession(): void {
  touchSession();
}

/** Forget the activity timestamp. Call when signing out. */
export function clearSessionActivity(): void {
  try {
    storage()?.removeItem(ACTIVITY_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Milliseconds since the last recorded activity.
 *
 * A missing or unparsable timestamp is treated as "idle for the full limit"
 * rather than "just active" — an unknown age must not silently extend a session.
 */
export function idleMilliseconds(now: number = Date.now()): number {
  const raw = storage()?.getItem(ACTIVITY_KEY);
  if (!raw) return Number.POSITIVE_INFINITY;

  const last = Number(raw);
  if (!Number.isFinite(last) || last <= 0) return Number.POSITIVE_INFINITY;

  return Math.max(0, now - last);
}

/** True once the idle limit has passed. */
export function isSessionExpired(now: number = Date.now()): boolean {
  return idleMilliseconds(now) > RESOLVED_IDLE_MS;
}

/**
 * Milliseconds left before the session expires, or `null` once it already has.
 * The portal shows a countdown from `IDLE_WARNING_MS` so a 15 minute sign-out is
 * never a surprise.
 */
export function sessionRemaining(now: number = Date.now()): number | null {
  const elapsed = idleMilliseconds(now);
  if (!Number.isFinite(elapsed)) return null;

  const remaining = RESOLVED_IDLE_MS - elapsed;

  return remaining > 0 ? remaining : null;
}

export const SESSION_IDLE_MINUTES = IDLE_LIMIT_MINUTES;