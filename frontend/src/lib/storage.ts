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
