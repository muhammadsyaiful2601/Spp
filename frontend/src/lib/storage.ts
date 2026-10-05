import type { Profile } from "../types";
import { readStoredUser, readToken } from "../api";
import type { AuthUser } from "../api";
import { initialProfile } from "../constants";

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Persist a small UI preference (currently the chosen academic year) so the app
 * reopens on the same scope. Failures are ignored because storage can be
 * unavailable in private mode and losing this preference is not fatal.
 */
export function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/**
 * Read a cached profile and merge it over the current defaults. A cache written
 * before the theme feature exists has no `themePrimary`, so merging keeps the
 * stored branding while backfilling anything new.
 */
export function readProfile(): Profile {
  return {
    ...initialProfile,
    ...readLocal<Partial<Profile>>("cendekia-profile", {}),
  };
}

/**
 * Read-only data snapshots kept for instant first paint. The session keys
 * (`cendekia-token`, `cendekia-user`) and the small preferences
 * (`cendekia-academic-year`, `cendekia-read-notices`) are deliberately absent:
 * clearing the cache must never sign the user out or reset their choices.
 */
const READ_CACHE_KEYS = [
  "cendekia-students",
  "cendekia-transactions",
  "cendekia-profile",
  "cendekia-spp-amounts",
] as const;

/**
 * Remove every read-only snapshot and return the bytes freed. Failures are
 * swallowed per key: storage can be unavailable in private mode and one bad
 * key must not stop the rest.
 */
export function clearReadCaches(): number {
  let freed = 0;
  for (const key of READ_CACHE_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value === null) continue;
      freed += new Blob([key, value]).size;
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  return freed;
}

/** Human-readable size for the cache cleanup toast. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Restore the signed-in user from the persisted session. */
export function readSessionUser(): AuthUser | null {
  const token = readToken();
  return token ? readStoredUser() : null;
}
