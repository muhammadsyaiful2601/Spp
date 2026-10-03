import axios from 'axios'

export const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api/v1'
export const apiOrigin = new URL(apiBaseUrl, window.location.origin).origin

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: "pimpinan" | "admin";
  username: string;
  /** Storage-relative path of the avatar; null when the user has no photo. */
  photo_path: string | null;
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
  /** Storage-relative path; null when the account uses initials. */
  photo_path: string | null
  /** False until the address is confirmed; the portal is gated until then. */
  email_verified: boolean
  email_verified_at: string | null
}

export async function fetchAccount(): Promise<AccountDetails> {
  const { data } = await api.get<{ data: AccountDetails }>("/auth/me")
  return data.data
}

export async function updateAccount(input: {
  name: string
  username: string
  email: string
}): Promise<AccountDetails> {
  const { data } = await api.post<{ data: AccountDetails }>("/auth/profile", input)
  return data.data
}

/** Replace the signed-in user's avatar. */
export async function uploadProfilePhoto(file: File): Promise<AccountDetails> {
  const form = new FormData()
  form.append("photo", file)
  const { data } = await api.post<{ data: AccountDetails }>("/auth/photo", form, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data.data
}

/** Remove the avatar so initials are shown again. */
export async function deleteProfilePhoto(): Promise<AccountDetails> {
  const { data } = await api.delete<{ data: AccountDetails }>("/auth/photo")
  return data.data
}

/** Client-side guard mirroring the server's `image` + 2 MB rule. */
export function validatePhotoFile(file: File): string | null {
  const allowed = ["image/png", "image/jpeg", "image/webp"]
  if (!allowed.includes(file.type)) return "Gunakan gambar PNG, JPG, atau WebP."
  if (file.size > 2 * 1024 * 1024) return "Ukuran foto maksimal 2 MB."
  return null
}

/** Absolute URL for an avatar, or an empty string when there is none. */
export function avatarUrl(photoPath: string | null | undefined): string {
  return photoPath ? publicStorageUrl(photoPath) : ""
}

// --- Password recovery -----------------------------------------------------
// These two are reachable without a session so a locked-out user can get back in.

/**
 * Ask for a reset code.
 *
 * The emailed code is deliberately not read from the response. Returning it to
 * the browser puts the code on screen, in the DOM, and in any screenshot taken
 * during support — and a leaked reset code hands over the account. Local
 * testing reads the code from the inbox or the application log instead.
 */
export async function forgotPassword(identifier: string): Promise<void> {
  await api.post("/auth/forgot-password", { identifier })
}

export async function resetPassword(input: {
  token: string
  password: string
  password_confirmation: string
}): Promise<void> {
  await api.post("/auth/reset-password", input)
}

// --- Email verification ----------------------------------------------------

/** Same reasoning as `forgotPassword`: the code stays out of the browser. */
export async function sendVerificationCode(): Promise<void> {
  await api.post("/auth/verification/send")
}

export async function verifyEmailCode(code: string): Promise<void> {
  await api.post("/auth/verification/verify", { code })
}

/** True when the API refused an action because the address is unverified. */
export function isUnverifiedError(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    error.response?.status === 403 &&
    (error.response.data as { code?: string } | undefined)?.code === "email_unverified"
  )
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

export type AcademicYear = {
  id: number
  name: string
  start_year: number
  end_year: number
  is_active: boolean
  /** Distinct students billed in this year. */
  students_count: number
  bills_count: number
  received: number
  /** False when the year has no SPP periods yet, so it would price at Rp 0. */
  has_tariffs: boolean
}

export type CreateAcademicYearInput = {
  start_year: number
  end_year: number
  /** Clone SPP periods and non-SPP tariffs from this existing year. */
  copy_from?: number | null
  is_active?: boolean
}

export async function fetchAcademicYears(): Promise<AcademicYear[]> {
  const { data } = await api.get<{ data: AcademicYear[] }>('/data/tahun-ajaran')
  return data.data
}

export async function createAcademicYear(input: CreateAcademicYearInput): Promise<AcademicYear> {
  const { data } = await api.post<{ data: AcademicYear }>('/pimpinan/tahun-ajaran', input)
  return data.data
}

export async function activateAcademicYear(yearId: number): Promise<void> {
  await api.post(`/pimpinan/tahun-ajaran/${yearId}/aktifkan`)
}

export async function fetchPortalData(academicYearId?: number | null): Promise<PortalData> {
  // Omitting the id lets the server fall back to the active year.
  const params = academicYearId ? { academic_year_id: academicYearId } : undefined
  const { data } = await api.get<{ data: PortalData }>('/data/portal', { params })
  return data.data
}

export type Treasurer = {
  id: number
  name: string
  username: string
  email: string
  role: "admin"
  is_active: boolean
  created_at: string | null
  /** Storage-relative avatar path, or null when the treasurer has no photo. */
  photo_path: string | null
  last_login_at: string | null
}

export type CreateTreasurerInput = {
  name: string
  username: string
  email: string
  password: string
  password_confirmation: string
}

export async function fetchTreasurers(): Promise<Treasurer[]> {
  const { data } = await api.get<{ data: Treasurer[] }>('/pimpinan/bendahara')
  return data.data
}

export async function createTreasurer(input: CreateTreasurerInput): Promise<Treasurer> {
  const { data } = await api.post<{ data: Treasurer }>('/pimpinan/bendahara', input)
  return data.data
}

export async function updateTreasurer(
  id: number,
  input: { name: string; username: string; email: string },
): Promise<Treasurer> {
  const { data } = await api.put<{ data: Treasurer }>(`/pimpinan/bendahara/${id}`, input)
  return data.data
}

export async function resetTreasurerPassword(
  id: number,
  password: string,
  passwordConfirmation: string,
): Promise<void> {
  await api.post(`/pimpinan/bendahara/${id}/password`, {
    password,
    password_confirmation: passwordConfirmation,
  })
}

export async function setTreasurerActive(id: number, isActive: boolean): Promise<Treasurer> {
  const { data } = await api.post<{ data: Treasurer }>(`/pimpinan/bendahara/${id}/status`, {
    is_active: isActive,
  })
  return data.data
}

export type SppPeriod = {
  id: number
  academic_year_id: number
  class_level_id: number
  name: string
  month_start: number
  month_end: number
  monthly_amount: number
  academic_year: string
  class_level: string
}

export type PositionRate = {
  id: number
  payment_position_id: number
  academic_year_id: number
  class_level_id: number
  amount: number
  position: string
  type: string
  is_active: number | boolean
  academic_year: string
  class_level: string
}

export async function fetchSppPeriods(academicYearId?: number | null): Promise<SppPeriod[]> {
  const params = academicYearId ? { academic_year_id: academicYearId } : undefined
  const { data } = await api.get<{ data: SppPeriod[] }>('/pimpinan/tarif-spp', { params })
  return data.data
}

export async function fetchPositionRates(): Promise<PositionRate[]> {
  const { data } = await api.get<{ data: PositionRate[] }>('/pimpinan/tarif-non-spp')
  return data.data
}

/** Save one nominal per class; the server applies it to both semesters. */
export async function saveSppRates(
  academicYearId: number,
  rates: { class_level_id: number; monthly_amount: number }[],
): Promise<void> {
  await api.post('/pimpinan/tarif-spp', { academic_year_id: academicYearId, rates })
}

export async function savePositionRates(input: {
  academic_year_id: number
  class_level_id: number
  positions: {
    payment_position_id: number
    amount: number
    is_active?: boolean
  }[]
}): Promise<void> {
  await api.post('/pimpinan/tarif-non-spp', input)
}

export async function createPosition(input: {
  name: string
  type: string
  amount: number
  academic_year_id: number
}): Promise<{ id: number; name: string }> {
  const { data } = await api.post<{ data: { id: number; name: string } }>(
    '/pimpinan/pos-biaya',
    input,
  )
  return data.data
}

// --- Activity log (audit trail) --------------------------------------------
export type ActivityLogActor = {
  id: number | null
  name: string | null
  username: string | null
  role: string | null
  role_label: string
}

export type ActivityLogEntry = {
  id: number
  action: string
  category: string
  category_label: string
  description: string
  actor: ActivityLogActor
  /** The student/account the action was performed on, when it has one target. */
  subject: { type: string; id: number | null; label: string | null } | null
  /** Raw values (amounts, months, ...) that the page formats for display. */
  details: Record<string, unknown>
  ip_address: string | null
  created_at: string | null
}

export type ActivityLogCategory = { value: string; label: string }

export type ActivityLogResult = {
  entries: ActivityLogEntry[]
  page: number
  perPage: number
  total: number
  lastPage: number
  summary: {
    total: number
    today: number
    actors: number
    filtered: number
    byCategory: Record<string, number>
  }
  categories: ActivityLogCategory[]
}

export type ActivityLogFilters = {
  search?: string
  category?: string
  from?: string
  to?: string
  page?: number
  perPage?: number
}

/**
 * Read one page of the audit trail.
 *
 * `pimpinan` only — the server answers 403 for any other role, and the sidebar
 * link is hidden for them too. Blank filters are dropped so the request never
 * carries `category=undefined`.
 */
export async function fetchActivityLogs(
  filters: ActivityLogFilters = {},
): Promise<ActivityLogResult> {
  const params: Record<string, string | number> = {}
  if (filters.search?.trim()) params.search = filters.search.trim()
  if (filters.category) params.category = filters.category
  if (filters.from) params.from = filters.from
  if (filters.to) params.to = filters.to
  if (filters.page) params.page = filters.page
  if (filters.perPage) params.per_page = filters.perPage

  const { data } = await api.get<{
    data: ActivityLogEntry[]
    meta: { page: number; per_page: number; total: number; last_page: number }
    summary: {
      total: number
      today: number
      actors: number
      filtered: number
      by_category: Record<string, number | string>
    }
    categories: ActivityLogCategory[]
  }>('/pimpinan/log-aktivitas', { params })

  return {
    entries: data.data,
    page: data.meta.page,
    perPage: data.meta.per_page,
    total: data.meta.total,
    lastPage: data.meta.last_page,
    summary: {
      total: data.summary.total,
      today: data.summary.today,
      actors: data.summary.actors,
      filtered: data.summary.filtered,
      // The database driver decides whether a COUNT arrives as a number or a
      // string, so the totals are coerced once, here.
      byCategory: Object.fromEntries(
        Object.entries(data.summary.by_category).map(([key, value]) => [
          key,
          Number(value),
        ]),
      ),
    },
    categories: data.categories,
  }
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