import axios from 'axios'
import type { Transaction } from './types'

export const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api/v1'
export const apiOrigin = new URL(apiBaseUrl, window.location.origin).origin

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: "pimpinan" | "admin";
  username: string;
  /** Employee number, printed in the signature block of receipts and reports. */
  nip?: string | null;
  /** Storage-relative path of the avatar; null when the account has no photo. */
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

/**
 * Read-only snapshots mirrored into localStorage for a fast first paint.
 *
 * Kept here, next to the session keys, because these are account data: leaving
 * them behind on sign-out is what let the next person to use the browser see the
 * previous account's students and figures before their own data arrived.
 */
export const READ_CACHE_KEYS = [
  "cendekia-students",
  "cendekia-transactions",
  "cendekia-profile",
  "cendekia-spp-amounts",
] as const

/** Fired after a session is torn down so the running app can drop its state. */
export const SESSION_PURGED_EVENT = "cendekia:session-purged"

/**
 * Remove everything tied to the signed-in account.
 *
 * `clearSession()` alone only dropped the token, leaving the mirrored data in
 * storage and in the running app. Signing in as somebody else then rendered the
 * previous account's students, transactions and school profile until their own
 * data arrived — and kept showing them if those requests failed.
 *
 * `silent` covers a deliberate sign-out: storage is still cleared (so other tabs
 * follow the token disappearing), but the app is told nothing here because it
 * already knows why, and announcing it would greet a user who pressed "Keluar"
 * with an "your session ended" warning.
 */
export function purgeSession(options: { silent?: boolean } = {}): void {
  clearSession()
  try {
    const store = storage()
    if (!store) return
    for (const key of READ_CACHE_KEYS) {
      store.removeItem(key)
    }
  } catch {
    /* ignore */
  }
  // The token is gone from storage; the in-memory app has to hear about it too,
  // because nothing else will re-render it out of the signed-in state.
  if (!options.silent && typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_PURGED_EVENT))
  }
}

/**
 * How long the browser waits before giving up on a request.
 *
 * This was 8 seconds, which is not a patience problem so much as a diagnosis
 * problem: the app reported every one of those as "the server cannot be
 * contacted", so a request that was merely slow — a login whose notification
 * mail held the response, a report scanning a year of payments — looked exactly
 * like a dead backend. Sign-in in particular sat right at that edge, so it
 * failed intermittently and a refresh made it work, which reads as "the server
 * is flaky" rather than "our timeout is wrong".
 *
 * Long enough that ordinary work finishes, short enough that a genuinely dead
 * host is still reported quickly. Override with VITE_API_TIMEOUT_MS.
 */
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 30_000);

export const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { Accept: 'application/json' },
  timeout: Number.isFinite(REQUEST_TIMEOUT_MS) && REQUEST_TIMEOUT_MS > 0
    ? REQUEST_TIMEOUT_MS
    : 30_000,
})
api.interceptors.request.use((config) => {
  const token = readToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
// A rejected token means the session is dead. Dropping only the token left the
// app rendered as if still signed in, so every later request failed again and
// the user saw a wall of errors instead of the login screen. Purge the whole
// session and let the app reset itself.
//
// The sign-in call is excluded on purpose: wrong credentials answer 401 too, and
// treating that as an expired session would wipe storage and greet a user who
// merely mistyped their password with "your session ended".
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isSignIn = typeof error?.config?.url === 'string'
      && error.config.url.endsWith('/auth/login')
    if (axios.isAxiosError(error) && error.response?.status === 401 && !isSignIn) {
      purgeSession()
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

/**
 * True when the API host itself is unreachable, as opposed to a rejected login.
 *
 * A timeout counts as unreachable for one reason only: the browser reports both
 * as a network error, and the user needs to be told which one happened. Telling
 * them the server is down when it is merely busy sends them off to restart a
 * process that is running perfectly well, so {@link isTimeout} exists to say the
 * honest thing instead.
 */
export function isNetworkFailure(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response && !isTimeout(error)
}

/**
 * True when the request was abandoned by us before the server answered.
 *
 * The server was reachable — it simply did not reply in time — which is a very
 * different instruction for the person reading the message.
 */
export function isTimeout(error: unknown): boolean {
  return axios.isAxiosError(error) && error.code === 'ECONNABORTED'
}

/**
 * True when the server refused the request with 429 (throttle: too many
 * attempts). The message Laravel returns is English and developer-facing, so
 * callers translate it into a friendly local notice.
 */
export function isRateLimited(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 429
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
  /** Empty string clears the NIP; the server treats it as null. */
  nip?: string
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

export type SavedPayment = {
  transaction_number: string
  amount: number
  paid_at: string
}

export async function paySpp(input: {
  student_id: number
  academic_year_id: number
  months: number[]
}): Promise<SavedPayment> {
  const { data } = await api.post<{ data: SavedPayment }>("/admin/pembayaran/spp", input)
  return data.data
}

export async function payNonSpp(input: {
  student_id: number
  position_rate_id: number
  amount: number
}): Promise<SavedPayment> {
  const { data } = await api.post<{ data: SavedPayment }>("/admin/pembayaran/non-spp", input)
  return data.data
}

/** One recorded payment, as the correction screen shows it. */
export type StudentTransaction = {
  id: number
  number: string
  type: "spp" | "non_spp"
  detail: string
  /** Calendar months (1..12) an SPP payment settled; empty for other fees. */
  months: number[]
  amount: number
  status: string
  paid_at: string
  date: string
}

/**
 * The correction payload.
 *
 * Every field is optional so a treasurer can fix just the date, just the
 * amount, or just the months. The server rejects an amount change on an SPP
 * payment — that figure follows the months — so the client only has to omit it.
 */
export type UpdatePaymentInput = {
  amount?: number
  paid_at?: string
  months?: number[]
}

export async function fetchStudentTransactions(
  studentId: number,
  academicYearId?: number | null,
): Promise<StudentTransaction[]> {
  const params = academicYearId ? { academic_year_id: academicYearId } : undefined
  const { data } = await api.get<{ data: StudentTransaction[] }>(
    `/admin/siswa/${studentId}/transaksi`,
    { params },
  )
  return data.data
}

export async function updatePaymentTransaction(
  transactionNumber: string,
  input: UpdatePaymentInput,
): Promise<SavedPayment> {
  const { data } = await api.patch<{ data: SavedPayment }>(
    `/admin/transaksi/${transactionNumber}`,
    input,
  )
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
export async function forgotPassword(email: string): Promise<void> {
  await api.post("/auth/forgot-password", { email })
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

/**
 * Message for a failed payment write.
 *
 * `fallback` exists because the same server error shape is reused for
 * corrections, where saying "pembayaran belum tersimpan" would be misleading.
 */
export function paymentErrorMessage(
  error: unknown,
  fallback = "Pembayaran gagal disimpan. Silakan coba kembali.",
): string {
  if (axios.isAxiosError(error)) {
    const errors = (error.response?.data as { errors?: Record<string, string[]> } | undefined)?.errors
    for (const messages of Object.values(errors ?? {})) {
      if (Array.isArray(messages) && messages.length > 0) return String(messages[0])
    }
    const message = (error.response?.data as { message?: string } | undefined)?.message
    if (message) return message
    if (!error.response) return "Server tidak dapat dihubungi. Perubahan belum tersimpan."
  }
  return fallback
}

/**
 * First validation message from any branding field on the school profile
 * (identity, logo, theme), with role/session/network fallbacks. The identity
 * form posts several fields at once, so the failing field name is not known
 * up front the way `validationMessage` requires.
 */
export function brandingErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const errors = (error.response?.data as { errors?: Record<string, string[]> } | undefined)?.errors
    for (const messages of Object.values(errors ?? {})) {
      if (Array.isArray(messages) && messages.length > 0) return String(messages[0])
    }
    if (error.response?.status === 403) return "Hanya pimpinan yang dapat mengubah profil sekolah."
    if (error.response?.status === 401) return "Sesi Anda berakhir. Silakan masuk kembali."
    if (!error.response) return "Server tidak dapat dihubungi. Coba lagi beberapa saat."
  }
  return fallback
}

export type PublicSchoolProfile = {
  school_name: string
  foundation_name: string | null
  logo_path: string | null
  favicon_path: string | null
  address: string
  phone: string | null
  email: string | null
  website: string | null
  receipt_note: string | null
  theme_primary: string
  theme_accent: string
  /** Fixed payment account shown on receipts and reports. */
  bank_name: string | null
  bank_account_number: string | null
  bank_account_holder: string | null
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

export async function fetchSchoolLogoDataUrl(): Promise<string | null> {
  const { data } = await api.get<Blob>('/public/sekolah-profile/logo', {
    responseType: 'blob',
  })
  if (data.size === 0) return null
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Logo sekolah tidak dapat dibaca.'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Logo sekolah tidak dapat dibaca.'))
    reader.readAsDataURL(data)
  })
}

/** Full row for the identity editor — includes fields the public endpoint omits. */
export async function fetchSchoolProfile(): Promise<SchoolProfile> {
  const { data } = await api.get<{ data: SchoolProfile }>('/pimpinan/sekolah-profile')
  return data.data
}

export type SchoolProfileIdentity = {
  school_name: string
  foundation_name: string | null
  address: string
  phone: string | null
  email: string | null
  website?: string | null
  receipt_note: string | null
  bank_name: string | null
  bank_account_number: string | null
  bank_account_holder: string | null
  receipt_template?: string | null
}

/**
 * Persist the identity form to the database (`role:pimpinan`). The endpoint
 * replaces the whole row and the form carries the editable fields only, so the
 * server-derived values (`website`, `receipt_template`) are carried through
 * from the current row instead of being wiped on every save.
 */
export async function saveSchoolProfile(identity: SchoolProfileIdentity): Promise<SchoolProfile> {
  const current = await fetchSchoolProfile()
  const { data } = await api.post<{ data: SchoolProfile }>('/pimpinan/sekolah-profile', {
    ...identity,
    website: identity.website ?? current.website,
    receipt_template: identity.receipt_template ?? current.receipt_template,
  })
  return data.data
}

/** Upload the school logo to the server (`role:pimpinan`); replaces any previous file. */
export async function uploadSchoolLogo(file: File): Promise<SchoolProfile> {
  const body = new FormData()
  body.append('logo', file)
  const { data } = await api.post<{ data: SchoolProfile }>(
    '/pimpinan/sekolah-profile/upload-logo',
    body,
  )
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
  spp_arrears: number
  non_spp_arrears: number
  spp_unpaid_count: number
  spp_total_count: number
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

/** One row of the payment report; adds the class and ids the filters use. */
export type PaymentReportRow = PortalTransaction & {
  student_id: number
  class_name: string
}

export type PaymentReportResult = {
  rows: PaymentReportRow[]
  meta: {
    count: number
    /** True when the server hit its safety cap — the report is not complete. */
    truncated: boolean
    limit: number
    academic_year_id: number | null
  }
}

/**
 * Filters for the payment report. Omitted values mean "all", matching the
 * server's own defaults (no month filter, no class filter, and the active
 * academic year when no year is given).
 */
export type PaymentReportFilters = {
  academicYearId?: number | null
  classLevelId?: number | null
  studentId?: number | null
  month?: number | null
}

/**
 * The payment report is read from the server rather than from the portal feed.
 *
 * The portal payload caps transactions at the 100 most recent ones because the
 * dashboard only renders a short recent list. Reports are documents and must
 * show every matching payment, so they ask for the full history here. That is
 * why `truncated` is surfaced instead of being swallowed: if a report ever
 * hits the server cap, the caller can say so rather than presenting a partial
 * statement as if it were the whole one.
 */
export async function fetchPaymentReport(filters: PaymentReportFilters = {}): Promise<PaymentReportResult> {
  const params: Record<string, string | number> = {}
  if (filters.academicYearId) params.academic_year_id = filters.academicYearId
  if (filters.classLevelId) params.class_level_id = filters.classLevelId
  if (filters.studentId) params.student_id = filters.studentId
  if (filters.month) params.month = filters.month

  const { data } = await api.get<{
    data: PaymentReportRow[]
    meta: PaymentReportResult['meta']
  }>('/reports/pembayaran', { params })

  return { rows: data.data, meta: data.meta }
}

/** Map an API transaction row to the shape the tables and exports expect. */
export function toTransaction(row: PortalTransaction): Transaction {
  return {
    id: row.number,
    student: row.student,
    detail: row.detail,
    date: row.date,
    amount: row.amount,
    status: row.status,
    paidAt: row.paid_at,
    // Report rows join the student's class; portal rows do not carry it.
className: "class_name" in row ? (row as PaymentReportRow).class_name : undefined,
  };
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
    spp_paid_count: number
    spp_unpaid_count: number
    spp_total_count: number
    non_spp_arrears: number
    students_count: number
    /** Actual rupiah per month, ordered Jul..Jun. */
    monthly_revenue: number[]
  }
}

export type StudentBills = {
  spp: {
    id: number
    month: number
    amount: number
    status: "belum_bayar" | "lunas"
    paid_at: string | null
  }[]
  non_spp: {
    id: number
    position_rate_id: number
    amount_due: number
    amount_paid: number
    status: "belum_bayar" | "sebagian" | "lunas"
    position: string
  }[]
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

export type PaginatedStudent = {
  id: number
  nisn: string
  student_number: string
  full_name: string
  class_level: string
  class_level_id: number
}

export type PaginatedStudentsResponse = {
  data: PaginatedStudent[]
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
    from: number | null
    to: number | null
  }
}

export async function fetchPaginatedStudents(input: {
  page?: number
  per_page?: number
  search?: string
  class_level_id?: number
}): Promise<PaginatedStudentsResponse> {
  const params: Record<string, string | number> = {}
  if (input.page !== undefined) params.page = input.page
  if (input.per_page !== undefined) params.per_page = input.per_page
  if (input.search) params.search = input.search
  if (input.class_level_id !== undefined) params.class_level_id = input.class_level_id
  const { data } = await api.get<{ data: PaginatedStudentsResponse }>('/admin/siswa', { params })
  return data.data
}

export async function fetchStudentBills(
  studentId: number,
  academicYearId?: number | null,
): Promise<StudentBills> {
  const params = academicYearId ? { academic_year_id: academicYearId } : undefined
  const { data } = await api.get<{ data: StudentBills }>(`/admin/siswa/${studentId}/tagihan`, { params })
  return data.data
}

/**
 * Register a student on the server.
 *
 * `class_level_id` is the primary key rather than the class name: the name is
 * display text and two levels could read the same once a school renames one.
 * The response is the stored row joined to its level, which is the only place
 * the new student's `id` (the primary key every payment needs) comes from.
 */
export async function createStudent(input: {
  nisn: string
  student_number: string
  full_name: string
  class_level_id: number
}): Promise<{ id: number; student_number: string; nisn: string; full_name: string; class_level: string }> {
  const { data } = await api.post<{ data: { id: number; student_number: string; nisn: string; full_name: string; class_level: string } }>(
    '/admin/siswa',
    input,
  )
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
  /** Payments this account recorded; a non-zero count blocks deletion. */
  transactions_count: number
  /** Server-decided: false when deleting would orphan payment history. */
  can_delete: boolean
  /** Why the delete button is disabled, in words, or null when it is allowed. */
  delete_blocked_reason: string | null
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

/**
 * Delete a treasurer outright.
 *
 * Only for accounts that never recorded a payment — the server enforces it, so
 * a caller that ignores `can_delete` gets a 422 rather than broken history.
 */
export async function deleteTreasurer(id: number): Promise<void> {
  await api.delete(`/pimpinan/bendahara/${id}`)
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

export async function fetchPositionRates(academicYearId?: number | null): Promise<PositionRate[]> {
  const params = academicYearId ? { academic_year_id: academicYearId } : undefined
  const { data } = await api.get<{ data: PositionRate[] }>('/pimpinan/tarif-non-spp', { params })
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

export async function deletePosition(positionId: number): Promise<void> {
  await api.delete(`/pimpinan/pos-biaya/${positionId}`)
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

/**
 * Erase the whole audit trail.
 *
 * Returns how many rows were removed, which is the number that existed *before*
 * the wipe — the single receipt row the server writes afterwards is not part of
 * it. The caller should say the same, or the toast and the table will disagree.
 */
export async function purgeActivityLogs(): Promise<{ deleted: number; message: string }> {
  const { data } = await api.delete<{ data: { deleted: number }; message: string }>(
    "/pimpinan/log-aktivitas",
  )

  return { deleted: data.data.deleted, message: data.message }
}

/** Download a full SQL backup through the leadership-only endpoint. */
export async function downloadDatabaseBackup(): Promise<void> {
  const response = await api.get<Blob>("/pimpinan/backup-database", {
    responseType: "blob",
  });
  const objectUrl = URL.createObjectURL(response.data);
  const disposition = response.headers["content-disposition"] as string | undefined;
  const filename = disposition?.match(/filename="?([^";]+)"?/i)?.[1]
    ?? `backup-database-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`;
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

/** Clear Laravel's configured application cache. */
export async function clearApplicationCache(): Promise<string> {
  const { data } = await api.post<{ message: string }>("/pimpinan/bersihkan-cache");
  return data.message;
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