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

/** Restore the signed-in user from the persisted session. */
export function readSessionUser(): AuthUser | null {
  const token = readToken();
  return token ? readStoredUser() : null;
}
