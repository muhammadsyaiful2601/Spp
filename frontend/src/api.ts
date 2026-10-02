import axios from 'axios'

export const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api/v1'
export const apiOrigin = new URL(apiBaseUrl, window.location.origin).origin

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: "pimpinan" | "admin";
}

// --- Session storage ------------------------------------------------------
// Kept in localStorage (not sessionStorage) so closing a tab, switching tabs or
// restarting the browser keeps the user signed in. sessionStorage was wiped on
// every new tab, which signed people out at random.
const TOKEN_KEY = "cendekia-token"
const USER_KEY = "cendekia-user"

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null // private mode / storage disabled
  }
}

/** Move a session left behind by the old sessionStorage-based build. */
function migrateLegacySession(): void {
  try {
    const legacy = window.sessionStorage
    const token = legacy.getItem(TOKEN_KEY)
    const user = legacy.getItem(USER_KEY)
    if (token || user) {
      const store = storage()
      if (token && store && !store.getItem(TOKEN_KEY)) store.setItem(TOKEN_KEY, token)
      if (user && store && !store.getItem(USER_KEY)) store.setItem(USER_KEY, user)
      legacy.removeItem(TOKEN_KEY)
      legacy.removeItem(USER_KEY)
    }
  } catch {
    /* ignore */
  }
}

migrateLegacySession()

export function readToken(): string | null {
  try {
    return storage()?.getItem(TOKEN_KEY) ?? null
  } catch {
    return null
  }
}

export function readStoredUser(): AuthUser | null {
  try {
    const raw = storage()?.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function storeSession(token: string, user: AuthUser): void {
  try {
    storage()?.setItem(TOKEN_KEY, token)
    storage()?.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    /* ignore */
  }
}

export function clearSession(): void {
  try {
    storage()?.removeItem(TOKEN_KEY)
    storage()?.removeItem(USER_KEY)
  } catch {
    /* ignore */
  }
}

export const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { Accept: 'application/json' },
  timeout: 8000,
})
api.interceptors.request.use((config) => {
  const token = readToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
// A rejected token means the session is dead; drop it so the UI falls back to the
// login screen instead of looping on failed requests.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      clearSession()
    }
    return Promise.reject(error)
  },
)

export async function login(
  username: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  const { data } = await api.post<{
    data: { user: AuthUser; token: string };
  }>("/auth/login", { username, password });
  storeSession(data.data.token, data.data.user);
  return data.data;
}

export async function logout(): Promise<void> {
  try {
    await api.post("/auth/logout");
  } finally {
    clearSession();
  }
}

/** True when the API host itself is unreachable, as opposed to a rejected login. */
export function isNetworkFailure(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response
}

// --- Account (own profile) ------------------------------------------------
export type AccountDetails = AuthUser & {
  username: string
  created_at: string | null
}

export async function fetchAccount(): Promise<AccountDetails> {
  const { data } = await api.get<{ data: AccountDetails }>("/auth/me")
  return data.data
}

export async function updateAccount(input: {
  name: string
  email: string
}): Promise<AccountDetails> {
  const { data } = await api.post<{ data: AccountDetails }>("/auth/profile", input)
  return data.data
}

export async function changePassword(input: {
  current_password: string
  password: string
  password_confirmation: string
}): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>("/auth/password", input)
  return data
}

/** Pull the first validation message the API returned, if any. */
export function validationMessage(error: unknown, field: string): string | null {
  if (!axios.isAxiosError(error)) return null
  const errors = (error.response?.data as { errors?: Record<string, string[]> } | undefined)?.errors
  const list = errors?.[field]
  return Array.isArray(list) && list.length > 0 ? String(list[0]) : null
}

export type PublicSchoolProfile = {
  school_name: string
  logo_path: string | null
  favicon_path: string | null
  address: string
  phone: string | null
  email: string | null
  website: string | null
  theme_primary: string
  theme_accent: string
}

export type SchoolProfile = PublicSchoolProfile & {
  id: number
  foundation_name: string | null
  stamp_path: string | null
  receipt_note: string | null
  receipt_template: string
}

export async function fetchPublicSchoolProfile(): Promise<PublicSchoolProfile> {
  const { data } = await api.get<{ data: PublicSchoolProfile }>('/public/sekolah-profile')
  return data.data
}

const faviconMaxBytes = 512 * 1024
const faviconMimeTypes = ["image/png", "image/jpeg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon"]

export function validateFaviconFile(file: File): string | null {
  if (!faviconMimeTypes.includes(file.type)) {
    return "Gunakan PNG, JPG, WebP, atau ICO."
  }
  if (file.size > faviconMaxBytes) {
    return "Ukuran favicon maksimal 512 KB."
  }
  return null
}

export async function uploadSchoolFavicon(file: File): Promise<SchoolProfile> {
  const body = new FormData()
  body.append("favicon", file)
  const { data } = await api.post<{ data: SchoolProfile }>(
    "/pimpinan/sekolah-profile/upload-favicon",
    body,
  )
  return data.data
}

export async function deleteSchoolFavicon(): Promise<SchoolProfile> {
  const { data } = await api.delete<{ data: SchoolProfile }>(
    "/pimpinan/sekolah-profile/favicon",
  )
  return data.data
}

export async function saveSchoolTheme(
  themePrimary: string,
  themeAccent: string,
): Promise<SchoolProfile> {
  const { data } = await api.post<{ data: SchoolProfile }>(
    "/pimpinan/sekolah-profile/theme",
    { theme_primary: themePrimary, theme_accent: themeAccent },
  )
  return data.data
}

export function publicStorageUrl(path: string): string {
  return new URL(`/storage/${path}`, apiOrigin).toString()
}

export type PortalStudent = {
  id: number
  student_number: string
  nisn: string
  name: string
  class_name: string
  /** Month indexes in academic order (0 = Jul ... 11 = Jun). */
  paid_months: number[]
}

export type PortalTransaction = {
  id: number
  number: string
  student: string
  type: "spp" | "non_spp"
  detail: string
  amount: number
  status: string
  paid_at: string
  date: string
}

export type PortalData = {
  academic_year: { id: number; name: string; start_year: number; end_year: number } | null
  class_levels: { id: number; name: string; sort_order: number }[]
  students: PortalStudent[]
  transactions: PortalTransaction[]
  spp_rates: number[]
  position_rates: {
    id: number
    payment_position_id: number
    class_level_id: number
    amount: number
    position: string
    type: string
  }[]
  summary: {
    total_received: number
    spp_arrears: number
    non_spp_arrears: number
    students_count: number
    /** Actual rupiah per month, ordered Jul..Jun. */
    monthly_revenue: number[]
  }
}

export async function fetchPortalData(): Promise<PortalData> {
  const { data } = await api.get<{ data: PortalData }>('/data/portal')
  return data.data
}

// --- Theme colour helpers -------------------------------------------------
// These accept `unknown` on purpose: values can arrive from a localStorage
// cache written before the theme feature existed, so `undefined`/`null` must
// never throw — that used to blank the whole screen on first render.
export const DEFAULT_THEME = {
  primary: '#24634e',
  accent: '#c88942',
} as const

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value.trim())
}

export function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback
  const trimmed = value.trim()
  return HEX_RE.test(trimmed) ? trimmed.toLowerCase() : fallback
}

/** Presets offered to `pimpinan`. Primary is the brand colour, accent the highlight. */
export type ThemePreset = {
  id: string
  label: string
  primary: string
  accent: string
}

export const themePresets: ThemePreset[] = [
  { id: 'hijau', label: 'Hijau Putih', primary: '#24634e', accent: '#c88942' },
  { id: 'toska', label: 'Toska Keemasan', primary: '#1f6f6b', accent: '#c9a227' },
  { id: 'nila', label: 'Biru Nila', primary: '#2b5c8a', accent: '#d4a017' },
  { id: 'marun', label: 'Marun Acts', primary: '#7d2c34', accent: '#cfa14b' },
  { id: 'ungu', label: 'Ungu Noble', primary: '#4a3b78', accent: '#c9a961' },
  { id: 'zafira', label: 'Biru Muda', primary: '#35618f', accent: '#3f9d8f' },
]

type Rgb = { r: number; g: number; b: number }

function hexToRgb(hex: string): Rgb {
  const value = parseInt(hex.replace('#', ''), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${((1 << 24) | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).slice(1)}`
}

/** Blend `hex` toward `target` by `amount` (0..1). */
function mix(hex: string, target: Rgb, amount: number): string {
  const base = hexToRgb(hex)
  return rgbToHex({
    r: base.r + (target.r - base.r) * amount,
    g: base.g + (target.g - base.g) * amount,
    b: base.b + (target.b - base.b) * amount,
  })
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }

/**
 * Build the full CSS custom-property ramp from the two chosen colours and apply
 * it to <html>. Every branded surface in the app reads from these variables, so
 * one selection re-themes the whole portal.
 */
export function applyTheme(primary: string, accent: string): void {
  const root = document.documentElement;
  const p = normalizeHex(primary, DEFAULT_THEME.primary);
  const a = normalizeHex(accent, DEFAULT_THEME.accent);

  const vars: Record<string, string> = {
    "--brand": p,
    // Sidebar sits deepest so the page canvas stays light.
    "--brand-deep": mix(p, BLACK, 0.35),
    "--brand-dark": mix(p, BLACK, 0.22),
    "--brand-nav": mix(p, BLACK, 0.08),
    "--brand-mid": mix(p, WHITE, 0.16),
    "--brand-strong": mix(p, BLACK, 0.17),
    "--brand-soft": mix(p, WHITE, 0.91),
    "--brand-tint": mix(p, WHITE, 0.84),
    "--brand-border": mix(p, WHITE, 0.66),
    "--brand-ink": mix(p, BLACK, 0.2),
    "--brand-ring": `${p}38`,
    "--brand-shadow": `${p}1f`,
    "--accent": a,
    "--accent-light": mix(a, WHITE, 0.35),
    "--accent-soft": mix(a, WHITE, 0.6),
    "--accent-tint": mix(a, WHITE, 0.84),
    "--accent-ink": mix(a, BLACK, 0.62),
  };

  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
  // Legacy aliases kept so existing rules keep working unchanged.
  root.style.setProperty("--green", vars["--brand"]);
  root.style.setProperty("--green-dark", vars["--brand-deep"]);
  root.style.setProperty("--green-soft", vars["--brand-soft"]);
  root.style.setProperty("--amber", vars["--accent"]);
  root.style.setProperty("--amber-soft", vars["--accent-tint"]);
  root.dataset.themePrimary = p;
  root.dataset.themeAccent = a;
}