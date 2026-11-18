import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ClipboardList,
  Clock,
  Database,
  HandCoins,
  History,
  LayoutDashboard,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import {
  activateAcademicYear,
  applyTheme,
  brandingErrorMessage,
  changePassword,
  purgeSession,
  SESSION_PURGED_EVENT,
  createAcademicYear,
  createTreasurer,
  deleteSchoolFavicon,
  fetchAcademicYears,
createStudent,
  fetchAccount,
  fetchActivityLogs,
  fetchPaymentReport,
  purgeActivityLogs,
  fetchPortalData,
  fetchPaginatedStudents,
  fetchStudentBills,
  fetchPublicSchoolProfile,
  fetchTreasurers,
  isHexColor,
  isNetworkFailure,
  isRateLimited,
  isTimeout,
  login as loginApi,
  logout as logoutApi,
  normalizeHex,
  publicStorageUrl,
  readToken,
  saveSchoolProfile,
  saveSchoolTheme,
  setTreasurerActive,
  storeSession,
  resetTreasurerPassword,
  toTransaction,
  updateAccount,
  updateTreasurer,
  uploadSchoolFavicon,
  uploadSchoolLogo,
  validateFaviconFile,
  validationMessage,
  type AuthUser,
  type PublicSchoolProfile,
  type SchoolProfile,
  type Treasurer,
  createPosition,
  deleteProfilePhoto,
  deletePosition,
  deleteTreasurer,
  fetchPositionRates,
  fetchSppPeriods,
  forgotPassword,
  resetPassword,
  savePositionRates,
  saveSppRates,
  sendVerificationCode,
  uploadProfilePhoto,
  validatePhotoFile,
  payNonSpp,
  paySpp,
  paymentErrorMessage,
  updatePaymentTransaction,
  verifyEmailCode,
  type StudentTransaction,
  type UpdatePaymentInput,
} from "./api";
import "./login.css";
import type { Notice, Page, Student, Transaction } from "./types";
import {
  initialSppRates,
  initialStudents,
  initialTransactions,
  monthNames,
} from "./constants";
import { formatToday, greetingPart } from "./lib/format";
import { studentSppAmount } from "./lib/students";
import { clearReadCaches, formatBytes, readLocal, readProfile, readSessionUser, writeLocal } from "./lib/storage";
import { applyFavicon, faviconErrorMessage } from "./lib/favicon";
import { buildNotices } from "./lib/notices";
import LoadingScreen from "./components/LoadingScreen";
import LoginPage from "./components/LoginPage";
import Dashboard from "./components/Dashboard";
import StudentsPage from "./components/StudentsPage";
import { printStudentReportPage } from "./studentPrint";
import type { ReportSections } from "./reportPdf";
import PaymentPage from "./components/PaymentPage";
import ReportsPage from "./components/ReportsPage";
import SettingsPage from "./components/SettingsPage";
import { useIdleLogout } from "./hooks/useIdleLogout";
import { clearSessionActivity, IDLE_WARNING_MS, startSession } from "./lib/session";
import ForgotPasswordPage from "./components/ForgotPasswordPage";
import EmailVerificationCard from "./components/EmailVerificationCard";
import type { CostRow, SppRow } from "./components/SettingsPage";
import BendaharaPage from "./components/BendaharaPage";
import ActivityLogPage from "./components/ActivityLogPage";
import MaintenancePage from "./components/MaintenancePage";
import AccountPage from "./components/AccountPage";
import type { TreasurerForm } from "./components/BendaharaPage";
import ProfilePage from "./components/ProfilePage";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import SidebarScrim from "./components/SidebarScrim";
import PaymentModal from "./components/PaymentModal";
import StudentModal from "./components/StudentModal";
import ReceiptModal from "./components/ReceiptModal";
import PaymentEditModal from "./components/PaymentEditModal";
import type { PaymentEditContext } from "./components/PaymentEditModal";
import Toast from "./components/Toast";


// Recovery emails link into the app: `?lupa=1` opens the password-recovery
// request step, and the reset email carries `/?kode=<code>` so its button
// opens the reset step with the code already filled in. Both flags are
// consumed exactly once per page load, outside React — StrictMode's
// double-invoked initializers must never re-read a URL the first call already
// stripped — and removed immediately: the code must not linger in the address
// bar, browser history, or referrer headers.
const recoveryEntry = (() => {
  const params = new URLSearchParams(window.location.search);
  const lupa = params.get("lupa") === "1";
  // Only a well-formed code (Str::random(64)) is honoured from the URL;
  // anything else is discarded instead of being copied into the form.
  const raw = params.get("kode");
  const kode = raw && /^[A-Za-z0-9]{64}$/.test(raw) ? raw : "";
  // The emailed link also carries the token's deadline, so the reset screen can
  // count the window down instead of leaving the user to find out by failing.
  // The browser could forge or edit this, so it drives the on-screen timer only:
  // the endpoint re-derives the real expiry from the stored row.
  const stamped = Number(params.get("s"));
  const expiresAt = Number.isSafeInteger(stamped) && stamped > 0 ? stamped : 0;
  if (!lupa && !kode) return { mode: "login" as const, token: "", expiresAt: 0 };
  params.delete("lupa");
  params.delete("kode");
  params.delete("s");
  const query = params.toString();
  window.history.replaceState(
    null,
    "",
    query ? `${window.location.pathname}?${query}` : window.location.pathname,
  );
  return { mode: "forgot" as const, token: kode, expiresAt: kode ? expiresAt : 0 };
})();

function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(readSessionUser);
  const [authError, setAuthError] = useState("");
  // Login and password recovery are two screens of the same signed-out flow;
  // `recoveryEntry` above decides which screen the page opens on.
  const [entry, setEntry] = useState(recoveryEntry);
  const [authMode, setAuthMode] = useState<"login" | "forgot">(entry.mode);
  const [recoverNotice, setRecoverNotice] = useState(
    entry.token
      ? "Tautan kode dari email diterima. Silakan buat kata sandi baru."
      : "",
  );
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  /**
   * Set only after a successful sign-in, never on a page reload.
   *
   * A refresh restores the session from storage and already has last-known data
   * in `localStorage` to draw, so replacing the whole interface with a splash
   * would be a regression — that is why this flag exists separately from
   * `authLoading`. Only a fresh sign-in has nothing to show yet.
   */
  const [bootingAfterLogin, setBootingAfterLogin] = useState(false);
  /**
   * Safety valve for the boot gate.
   *
   * The gate below waits for the first round of data. A server that answers
   * slowly — or an endpoint that never settles — must not lock the user out of
   * an application they have just proved they can log into, so the wait is
   * capped and the app opens with whatever did arrive.
   */
  const [bootTimedOut, setBootTimedOut] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [studentBusy, setStudentBusy] = useState(false);
  const [students, setStudents] = useState(() =>
    readLocal("cendekia-students", initialStudents),
  );
  const [transactions, setTransactions] = useState(() =>
    readLocal("cendekia-transactions", initialTransactions),
  );
  const [profile, setProfile] = useState(readProfile);
  const [sppAmounts, setSppAmounts] = useState<number[]>(() =>
    readLocal("cendekia-spp-amounts", initialSppRates),
  );
  const [search, setSearch] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [studentSearch, setStudentSearch] = useState("");
  const [selected, setSelected] = useState<Student | null>(null);
  const [modal, setModal] = useState<"payment" | "student" | "receipt" | null>(
    null,
  );
  const [payKind, setPayKind] = useState<"spp" | "non-spp">("spp");
  const [payMonths, setPayMonths] = useState<number[]>([]);
  const [payCost, setPayCost] = useState("");
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  /** Report month filter; `0` means every month. Calendar order, not billing. */
  const [reportMonth, setReportMonth] = useState(0);
  /** Which parts the printed report contains; everything by default. */
  const [reportSections, setReportSections] = useState<ReportSections>({
    payments: true,
    billStatus: true,
    arrears: true,
  });
  /** Report class filter as a class level id; `null` means every class. */
  const [reportClassId, setReportClassId] = useState<number | null>(null);
  /**
   * Report year filter; `null` follows the year chosen in the topbar.
   *
   * A report is a document about one period, so it carries its own year rather
   * than silently inheriting whatever the rest of the app happens to be looking
   * at. Keeping `null` as "follow the topbar" means opening the page still shows
   * the year the user is already working in.
   */
  const [reportYearOverride, setReportYearOverride] = useState<number | null>(null);
  // Audit-trail filters. `logSearchTerm` deliberately lags `logSearch` so typing
  // in the search box does not fire one request per keystroke.
  const [logSearch, setLogSearch] = useState("");
  const [logSearchTerm, setLogSearchTerm] = useState("");
  const [logCategory, setLogCategory] = useState("");
  const [logFrom, setLogFrom] = useState("");
  const [logTo, setLogTo] = useState("");
  const [logPage, setLogPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"spp" | "biaya">("spp");
  const [payAmount, setPayAmount] = useState(0);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [receiptTransaction, setReceiptTransaction] =
    useState<Transaction | null>(null);
  const [editTransaction, setEditTransaction] = useState<StudentTransaction | null>(null);
  const [editPaymentStudentId, setEditPaymentStudentId] = useState<number | undefined>(undefined);
  const [editPaymentContext, setEditPaymentContext] = useState<PaymentEditContext | null>(null);
  const [editPaymentBusy, setEditPaymentBusy] = useState(false);
  const [editPaymentError, setEditPaymentError] = useState("");
  const [faviconBusy, setFaviconBusy] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [academicYear, setAcademicYear] = useState("2026 / 2027");
  // Fallback start year, refined from the API once the portal payload arrives.
  const [academicStartYear, setAcademicStartYear] = useState(() => {
    const year = new Date().getFullYear();
    return new Date().getMonth() + 1 >= 7 ? year : year - 1;
  });
  // Selected year is remembered per browser; null means "let the server decide".
  const [selectedYearId, setSelectedYearId] = useState<number | null>(() =>
    readLocal<number | null>("cendekia-academic-year", null),
  );
  const [yearBusy, setYearBusy] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [readNotices, setReadNotices] = useState<string[]>(() =>
    readLocal("cendekia-read-notices", [] as string[]),
  );
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const today = formatToday(now);
  const queryClient = useQueryClient();
  // Declared ahead of the data queries below: several of them are gated on the
  // screen the user is on, and a query referencing `page` earlier would hit the
  // temporal dead zone during the first render.
  const [page, setPage] = useState<Page>("dashboard");
  const accountQuery = useQuery({
    queryKey: ["account", currentUser?.id],
    queryFn: fetchAccount,
    enabled: Boolean(currentUser),
  });

  /**
   * An unverified account is confined to the profile screen by the API, so the
   * UI mirrors that instead of offering buttons that would all fail with 403.
   * Until `/auth/me` resolves the account is treated as verified so a normal
   * session is never flashed to a blank page.
   */
  const emailVerified = accountQuery.data ? accountQuery.data.email_verified : true;

  // Derived, not synchronised: an unverified account always renders the profile
  // screen, and a non-leadership account can never land on maintenance. Defined
  // before the data queries because those queries are gated on the active page.
  const effectivePage: Page = !emailVerified
    ? "profil"
    : currentUser?.role !== "pimpinan" && page === "pemeliharaan"
      ? "dashboard"
      : page;

  const schoolProfileQuery = useQuery({
    queryKey: ["public-school-profile"],
    queryFn: fetchPublicSchoolProfile,
  });
  const academicYearsQuery = useQuery({
    queryKey: ["academic-years"],
    queryFn: fetchAcademicYears,
    enabled: Boolean(currentUser),
  });
  const academicYears = academicYearsQuery.data ?? [];
  const effectiveYearId =
    academicYears.find((year) => year.id === selectedYearId)?.id ??
    academicYears.find((year) => year.is_active)?.id ??
    academicYears[0]?.id ??
    null;
  const portalQuery = useQuery({
    queryKey: ["portal-data", effectiveYearId],
    queryFn: () => fetchPortalData(effectiveYearId),
    // Gated on the verification state, not just on being signed in. An
    // unverified account receives 403 for this endpoint, so firing it only
    // produced a guaranteed error that lingered in the cache and made the next
    // refetch look like a failure.
    enabled: Boolean(currentUser) && emailVerified,
  });

  // Server-side pagination for the siswa list. The `/admin/siswa` endpoint
  // already paginates (25 per page) and supports `search`; the frontend was
  // loading every student from `/data/portal` and slicing client-side instead.
  const studentPageQuery = useQuery({
    queryKey: ["paginated-students", effectiveYearId, studentPage, studentSearch],
    queryFn: () =>
      fetchPaginatedStudents({
        page: studentPage,
        per_page: 10,
        search: studentSearch,
      }),
    enabled: Boolean(currentUser) && emailVerified && effectivePage === "siswa",
  });

  // Which screen the user is actually looking at. Used below to keep expensive
  // queries off the login path: a screen that is not on display has no reason
  // to spend the user's connection on it.
  const isReportPage = effectivePage === "laporan";
  const canOpenTariffs =
    Boolean(currentUser) && emailVerified && effectivePage === "pengaturan";

  /**
   * The first round of data the shell needs before it is worth drawing.
   *
   * `isFetched` rather than `isSuccess` on purpose: these are settled, not
   * necessarily successful. Waiting for success would mean one failing endpoint
   * — or one account that legitimately has no academic year — held the splash
   * open forever, which is strictly worse than opening the app and letting the
   * screen show that something is missing.
   *
   * `portalQuery` is the reason this is sequential: it is keyed by
   * `effectiveYearId`, which only exists once the academic years arrive. When no
   * year resolves at all it never runs, so it must not be counted as pending.
   */
  const bootSteps = useMemo(
    () => [
      { label: "Memverifikasi akun", settled: !currentUser || accountQuery.isFetched },
      { label: "Memuat identitas sekolah", settled: schoolProfileQuery.isFetched },
      { label: "Memuat tahun ajaran", settled: !currentUser || academicYearsQuery.isFetched },
      {
        label: "Memuat data portal",
        settled:
          !currentUser ||
          effectiveYearId === null ||
          portalQuery.isFetched,
      },
    ],
    [
      currentUser,
      accountQuery.isFetched,
      schoolProfileQuery.isFetched,
      academicYearsQuery.isFetched,
      effectiveYearId,
      portalQuery.isFetched,
    ],
  );
  const bootReady = bootSteps.every((step) => step.settled);

  // The purge listener runs on every session teardown, so it is mounted once. Its
  // handler reads the reset through a ref: `resetSignedInState` closes over a
  // long list of setters, and depending on it would re-register the listener on
  // every render without ever changing what it does.
const resetSignedInStateRef = useRef(resetSignedInState);
useEffect(() => {
    resetSignedInStateRef.current = resetSignedInState;
  });

  useEffect(() => {
    // The server can reject a token at any moment — an idle session revoked it,
    // a treasurer was deactivated, the token simply expired. The response
    // interceptor purges storage; this puts the running interface back in step so
    // it does not sit on a signed-in screen that can no longer make a request.
    const onPurged = () => {
      clearSessionActivity();
      resetSignedInStateRef.current(
        "Sesi Anda berakhir. Silakan masuk kembali.",
      );
    };
    window.addEventListener(SESSION_PURGED_EVENT, onPurged);
    return () => window.removeEventListener(SESSION_PURGED_EVENT, onPurged);
  }, []);

  useEffect(() => {
    if (!bootingAfterLogin || bootReady) return;
    const timer = window.setTimeout(() => setBootTimedOut(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [bootingAfterLogin, bootReady]);

  const pendingBootLabel =
    bootSteps.find((step) => !step.settled)?.label ?? "Menyiapkan portal";

  const paymentBillsQuery = useQuery({
    queryKey: ["student-bills", selected?.dbId, effectiveYearId],
    queryFn: () => fetchStudentBills(selected!.dbId!, effectiveYearId),
    enabled: modal === "payment" && selected?.dbId !== undefined,
  });
  // Treasurer management is leadership-only; an admin hitting this gets a 403,
  // so the query stays disabled for them rather than firing a doomed request.
  const treasurersQuery = useQuery({
    queryKey: ["treasurers"],
    queryFn: fetchTreasurers,
    enabled:
      Boolean(currentUser) &&
      currentUser?.role === "pimpinan" &&
      effectivePage === "bendahara",
  });
  const [treasurerBusy, setTreasurerBusy] = useState(false);
  const [treasurerError, setTreasurerError] = useState("");
  // Only `pimpinan` may create or activate a year; hide the controls for `admin`
  // instead of letting them hit a 403.
  const canManageYears = currentUser?.role === "pimpinan";

  // The audit trail is leadership-only and gated on verification, exactly like
  // every other `pimpinan` route: an unverified account receives 403 for all of
  // them, so firing the request early would only cache a guaranteed error.
  const activityLogQuery = useQuery({
    queryKey: [
      "activity-logs",
      logSearchTerm,
      logCategory,
      logFrom,
      logTo,
      logPage,
    ],
    queryFn: () =>
      fetchActivityLogs({
        search: logSearchTerm,
        category: logCategory,
        from: logFrom,
        to: logTo,
        page: logPage,
        perPage: 15,
      }),
    enabled:
      Boolean(currentUser) &&
      emailVerified &&
      currentUser?.role === "pimpinan" &&
      // Gated on the page as well. The comment above asks for exactly this and
      // the previous `enabled` never did it: every leadership session fired the
      // request on login and on every filter keystroke, on every single screen.
      effectivePage === "log",
  });

  // Debounce the server-side search: 300ms is long enough to swallow a burst of
  // keystrokes and short enough to feel immediate. Any change returns to page 1,
  // otherwise the reader can land on a page that no longer exists.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLogSearchTerm(logSearch.trim());
      setLogPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [logSearch]);
  // Editable tariff drafts. Only the values the user has actually changed live in
  // state; everything else is derived from the server during render, which avoids
  // the cascading re-render that syncing via useEffect would cause.
  const [sppDrafts, setSppDrafts] = useState<Record<number, number>>({});
  const [costDrafts, setCostDrafts] = useState<Record<number, number>>({});
  const [costToggles, setCostToggles] = useState<Record<number, boolean>>({});
  const [costClassId, setCostClassId] = useState<number | null>(null);
  const [tariffBusy, setTariffBusy] = useState(false);
  const [tariffError, setTariffError] = useState("");
  const [lastTariffSavedAt, setLastTariffSavedAt] = useState<string | null>(null);

  const classLevelRows = useMemo(
    () =>
      (portalQuery.data?.class_levels ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((level) => ({ id: level.id, name: level.name })),
    [portalQuery.data],
  );

  // Tariff reads and writes are leadership-only: the backend enforces
  // `role:pimpinan` on every pricing endpoint. The menu above is hidden for
  // `admin`, so these queries never fire for a treasurer session.
const sppPeriodsQuery = useQuery({
    queryKey: ["spp-periods", effectiveYearId],
    queryFn: () => fetchSppPeriods(effectiveYearId),
    enabled: canOpenTariffs && effectiveYearId !== null,
  });
  const positionRatesQuery = useQuery({
    queryKey: ["position-rates", effectiveYearId],
    queryFn: () => fetchPositionRates(effectiveYearId),
    enabled: canOpenTariffs && effectiveYearId !== null,
  });

  // The year the report is about: an explicit choice on the reports screen when
  // one is made, otherwise whatever the topbar is scoped to.
  const reportYearId = reportYearOverride ?? effectiveYearId;
  const reportYearLabel =
    academicYears.find((year) => year.id === reportYearId)?.name ?? academicYear;

  // The report reads its own, complete history from the server. The portal feed
  // is capped at the 100 most recent payments because the dashboard only shows
  // a short recent list, so filtering that array here would silently truncate
  // every export to 100 rows.
  const paymentReportQuery = useQuery({
    queryKey: ["payment-report", reportYearId, reportClassId, reportMonth],
    queryFn: () =>
      fetchPaymentReport({
        academicYearId: reportYearId,
        classLevelId: reportClassId,
        month: reportMonth === 0 ? null : reportMonth,
      }),
    // The whole year's payments, downloaded on every login, for a page most
    // sessions never open. Loading it lazily is the single biggest win here:
    // it stays instant to open once the user actually goes to the report.
    enabled: isReportPage && reportYearId !== null,
  });
  const reportRows = useMemo(
    () => (paymentReportQuery.data?.rows ?? []).map(toTransaction),
    [paymentReportQuery.data],
  );

  /** Fall back to the first class level until the user picks another. */
  const effectiveCostClassId = costClassId ?? classLevelRows[0]?.id ?? null;

  /** One nominal per class, read from the first semester row for each level. */
  const sppRows: SppRow[] = useMemo(() => {
    const periods = sppPeriodsQuery.data ?? [];
    return classLevelRows.map((level) => {
      const match = periods.find((row) => row.class_level_id === level.id);
      const serverValue = match ? Number(match.monthly_amount) : 0;
      return {
        classLevelId: level.id,
        className: level.name,
        amount: sppDrafts[level.id] ?? serverValue,
      };
    });
  }, [classLevelRows, sppPeriodsQuery.data, sppDrafts]);

  /** Non-SPP rows for the class level currently being edited. */
  const costRows: CostRow[] = useMemo(() => {
    const rates = positionRatesQuery.data ?? [];
    return rates
      .filter((row) => row.class_level_id === effectiveCostClassId)
      .map((row) => ({
        paymentPositionId: row.payment_position_id,
        name: row.position,
        type: row.type,
        amount: costDrafts[row.payment_position_id] ?? Number(row.amount),
        isActive:
          costToggles[row.payment_position_id] ?? Boolean(row.is_active),
      }));
  }, [positionRatesQuery.data, effectiveCostClassId, costDrafts, costToggles]);

  /** Wrap a tariff mutation so failures surface on the page, not silently. */
  const runTariffAction = async (action: () => Promise<string>) => {
    setTariffBusy(true);
    setTariffError("");
    try {
      setToast(await action());
      setLastTariffSavedAt(new Date().toISOString());
      await Promise.all([sppPeriodsQuery.refetch(), positionRatesQuery.refetch()]);
    } catch (error) {
      setTariffError(
        validationMessage(error, "rates.0.monthly_amount") ??
          validationMessage(error, "positions.0.amount") ??
          validationMessage(error, "name") ??
          validationMessage(error, "amount") ??
          (isNetworkFailure(error)
            ? "Server tidak dapat dihubungi. Coba lagi beberapa saat."
            : "Perubahan tarif gagal disimpan."),
      );
    } finally {
      setTariffBusy(false);
    }
  };

  const saveSpp = () => {
    if (effectiveYearId === null) {
      setTariffError("Pilih tahun ajaran terlebih dahulu.");
      return;
    }
    void runTariffAction(async () => {
      await saveSppRates(
        effectiveYearId,
        sppRows.map((row) => ({
          class_level_id: row.classLevelId,
          monthly_amount: row.amount,
        })),
      );
      return "Tarif SPP berhasil disimpan.";
    });
  };

  const saveCosts = () => {
    if (effectiveYearId === null || effectiveCostClassId === null) {
      setTariffError("Pilih tahun ajaran dan tingkat kelas terlebih dahulu.");
      return;
    }
    void runTariffAction(async () => {
      await savePositionRates({
        academic_year_id: effectiveYearId,
        class_level_id: effectiveCostClassId,
        positions: costRows.map((row) => ({
          payment_position_id: row.paymentPositionId,
          amount: row.amount,
          is_active: row.isActive,
        })),
      });
      return "Tarif biaya berhasil disimpan.";
    });
  };

  const togglePosition = (row: CostRow, next: boolean) => {
    if (effectiveYearId === null || effectiveCostClassId === null) return;
    // Flip locally first so the switch responds immediately, then persist.
    setCostToggles((current) => ({ ...current, [row.paymentPositionId]: next }));
    void runTariffAction(async () => {
      await savePositionRates({
        academic_year_id: effectiveYearId,
        class_level_id: effectiveCostClassId,
        positions: [
          { payment_position_id: row.paymentPositionId, amount: row.amount, is_active: next },
        ],
      });
      return next ? `${row.name} diaktifkan.` : `${row.name} dinonaktifkan.`;
    });
  };

  const addPosition = (input: { name: string; type: string; amount: number }) => {
    if (effectiveYearId === null) return;
    void runTariffAction(async () => {
      const created = await createPosition({ ...input, academic_year_id: effectiveYearId });
      return `Pos biaya ${created.name} berhasil ditambahkan.`;
    });
  };
  const removePosition = (row: CostRow) => {
    if (!window.confirm(`Hapus pos biaya "${row.name}"? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    void runTariffAction(async () => {
      await deletePosition(row.paymentPositionId);
      return `Pos biaya ${row.name} berhasil dihapus.`;
    });
  };

  /**
   * The address typed into the verification card. Kept as a draft so a reload or
   * a failed save never silently reverts what the user entered.
   */
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const storedEmail = accountQuery.data?.email ?? currentUser?.email ?? "";
  const emailDirty = emailDraft !== null && emailDraft !== storedEmail;

  // Non-SPP positions are read from `position_rates`; the constant is only a
  // placeholder for the moment before the request resolves.
  // Class level names drive the SPP rate lookup, so they come from the database.
  const classLevels = useMemo(
    () =>
      (portalQuery.data?.class_levels ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((level) => level.name),
    [portalQuery.data],
  );
  // Non-SPP positions are read from `position_rates`; the list is empty until
  // the request resolves.
  // The theme is school-wide and managed by `pimpinan`, so the server value always
  // wins once it arrives. The cached value is only a fallback while offline or
  // before the first response.
  const effectiveTheme = {
    primary: normalizeHex(
      schoolProfileQuery.data?.theme_primary,
      profile.themePrimary,
    ),
    accent: normalizeHex(
      schoolProfileQuery.data?.theme_accent,
      profile.themeAccent,
    ),
  };
  const positionRates = useMemo(() => {
    const rates = portalQuery.data?.position_rates ?? [];
    const levels = portalQuery.data?.class_levels ?? [];
    if (rates.length === 0 || (selected?.dbId && !paymentBillsQuery.data)) return [];
    const selectedLevel = levels.find((level) => level.name === selected?.className);
    const classLevelId = selectedLevel?.id ?? levels[0]?.id;
    const seen = new Map<string, { rateId: number; name: string; type: string; amount: number }>();
    for (const rate of rates) {
      if (classLevelId && rate.class_level_id !== classLevelId) continue;
      if (seen.has(rate.position)) continue;
      const bill = paymentBillsQuery.data?.non_spp.find(
        (item) => item.position_rate_id === rate.id,
      );
      const remaining = Math.max(
        0,
        Number(bill?.amount_due ?? rate.amount) - Number(bill?.amount_paid ?? 0),
      );
      if (remaining === 0) continue;
      seen.set(rate.position, {
        rateId: rate.id,
        name: rate.position,
        type:
          rate.type === "tahunan"
            ? "Tahunan"
            : rate.type === "cicilan"
              ? "Cicilan"
              : "Sekali bayar",
        amount: remaining,
      });
    }
    return [...seen.values()];
  }, [portalQuery.data, paymentBillsQuery.data, selected?.className, selected?.dbId]);
  const notices = useMemo(
    () => buildNotices(students, transactions, sppAmounts, classLevels),
    [students, transactions, sppAmounts, classLevels],
  );
  const unreadCount = notices.filter(
    (item) => !readNotices.includes(item.id),
  ).length;

  // Routed through writeLocal rather than localStorage directly. Safari's
  // private mode and a full quota both make setItem throw, and an exception
  // escaping an effect takes the whole app down to the error boundary — losing
  // the cached feed in exchange for a blank page.
  useEffect(() => {
    writeLocal("cendekia-students", students);
  }, [students]);
  useEffect(() => {
    writeLocal("cendekia-transactions", transactions);
  }, [transactions]);
  useEffect(() => {
    writeLocal("cendekia-profile", profile);
  }, [profile]);
  useEffect(() => {
    writeLocal("cendekia-spp-amounts", sppAmounts);
  }, [sppAmounts]);
  useEffect(() => {
    const portal = portalQuery.data;
    if (!portal) return;
    startTransition(() => {
      setStudents(
        portal.students.map((student) => ({
          id: student.student_number,
          dbId: student.id,
          name: student.name,
          className: student.class_name,
          nisn: student.nisn,
          paid: student.paid_months,
          sppArrears: student.spp_arrears,
          nonSppArrears: student.non_spp_arrears,
          sppUnpaidCount: student.spp_unpaid_count,
          sppTotalCount: student.spp_total_count,
        })),
      );
      setTransactions(portal.transactions.map(toTransaction));
      if (portal.spp_rates.length > 0) {
        setSppAmounts(portal.spp_rates);
      }
      if (portal.academic_year) {
        setAcademicYear(portal.academic_year.name);
        setAcademicStartYear(portal.academic_year.start_year);
      }
    });
  }, [portalQuery.data]);

  /** Persist the chosen year and let the portal query refetch under that scope. */
  const selectYear = (yearId: number) => {
    setSelectedYearId(yearId);
    writeLocal("cendekia-academic-year", yearId);
  };

  /** Create a year (with its tariffs cloned) and switch straight into it. */
  const createYear = async (input: {
    startYear: number;
    endYear: number;
    copyFrom: number | null;
  }) => {
    setYearBusy(true);
    try {
      const created = await createAcademicYear({
        start_year: input.startYear,
        end_year: input.endYear,
        copy_from: input.copyFrom,
      });
      await academicYearsQuery.refetch();
      selectYear(created.id);
      setToast(`Tahun ajaran ${created.name} dibuat.`);
    } catch (error) {
      // Surface the server's own wording (duplicate name, bad range) when present.
      setToast(
        validationMessage(error, "name") ??
          validationMessage(error, "end_year") ??
          "Tahun ajaran gagal dibuat. Silakan coba kembali.",
      );
    } finally {
      setYearBusy(false);
    }
  };

  /** Make a year the server-side default so other clients resolve to it too. */
  const activateYear = async (yearId: number) => {
    setYearBusy(true);
    try {
      await activateAcademicYear(yearId);
      await academicYearsQuery.refetch();
      selectYear(yearId);
      setToast("Tahun ajaran aktif berhasil diperbarui.");
    } catch (error) {
      setToast(
        isNetworkFailure(error)
          ? "Server tidak dapat dihubungi. Coba lagi beberapa saat."
          : "Tahun ajaran gagal diaktifkan.",
      );
    } finally {
      setYearBusy(false);
    }
  };

  /**
   * Run a treasurer mutation, refresh the list and surface any API error on the
   * page itself so the treasurer never sees a silent failure.
   */
  const runTreasurerAction = async (action: () => Promise<string>) => {
    setTreasurerBusy(true);
    setTreasurerError("");
    try {
      setToast(await action());
      await treasurersQuery.refetch();
    } catch (error) {
      setTreasurerError(
        validationMessage(error, "username") ??
          validationMessage(error, "email") ??
          validationMessage(error, "password") ??
          validationMessage(error, "is_active") ??
          validationMessage(error, "name") ??
          (isNetworkFailure(error)
            ? "Server tidak dapat dihubungi. Coba lagi beberapa saat."
            : "Perubahan bendahara gagal disimpan."),
      );
    } finally {
      setTreasurerBusy(false);
    }
  };

  const addTreasurer = (input: TreasurerForm) =>
    void runTreasurerAction(async () => {
      const created = await createTreasurer(input);
      return `Akun bendahara ${created.name} berhasil dibuat.`;
    });

  const editTreasurer = (
    treasurer: Treasurer,
    input: { name: string; username: string; email: string },
  ) =>
    void runTreasurerAction(async () => {
      await updateTreasurer(treasurer.id, input);
      return `Data ${treasurer.name} berhasil diperbarui.`;
    });

  const changeTreasurerPassword = (treasurer: Treasurer, password: string) =>
    void runTreasurerAction(async () => {
      await resetTreasurerPassword(treasurer.id, password, password);
      return `Kata sandi ${treasurer.name} berhasil diperbarui.`;
    });

  const toggleTreasurer = (treasurer: Treasurer, next: boolean) =>
    void runTreasurerAction(async () => {
      await setTreasurerActive(treasurer.id, next);
      return next
        ? `Akun ${treasurer.name} diaktifkan kembali.`
        : `Akun ${treasurer.name} dinonaktifkan.`;
    });

  const removeTreasurer = (treasurer: Treasurer) =>
    void runTreasurerAction(async () => {
      await deleteTreasurer(treasurer.id);
      return `Akun ${treasurer.name} berhasil dihapus.`;
    });
  // The stored cost name may no longer exist once positions load, so resolve it
  // to a valid entry during render rather than syncing it in an effect.
  const activeCost =
    positionRates.find((cost) => cost.name === payCost) ?? positionRates[0];
  // The database is the single source of truth for branding: colours, name,
  // address, logo and favicon all arrive from `public-school-profile` and
  // overwrite the local cache whenever the server copy changes. React Query's
  // structural sharing keeps the same data reference while the server value is
  // unchanged, so a focus-refetch never clobbers edits still being typed —
  // the mirror runs only on first load or after an actual save (here or on
  // another device). localStorage remains only the first paint while the
  // request is in flight or the server is unreachable.
  useEffect(() => {
    const server = schoolProfileQuery.data;
    if (!server) return;
    startTransition(() => {
      setProfile(() => ({
        school: server.school_name,
        foundation: server.foundation_name ?? "",
        address: server.address,
        phone: server.phone ?? "",
        email: server.email ?? "",
        note: server.receipt_note ?? "",
        themePrimary: server.theme_primary,
        themeAccent: server.theme_accent,
        logo: server.logo_path ? publicStorageUrl(server.logo_path) : "",
        favicon: server.favicon_path
          ? publicStorageUrl(server.favicon_path)
          : "",
        bankName: server.bank_name ?? "",
        bankAccountNumber: server.bank_account_number ?? "",
        bankAccountHolder: server.bank_account_holder ?? "",
      }));
    });
  }, [schoolProfileQuery.data]);
  useEffect(() => {
    applyTheme(effectiveTheme.primary, effectiveTheme.accent);
  }, [effectiveTheme.primary, effectiveTheme.accent]);
  useEffect(() => {
    applyFavicon(profile.favicon, profile.logo);
  }, [profile.favicon, profile.logo]);
  useEffect(() => {
    const school = profile.school.trim();
    if (school) document.title = `${school} · Portal Keuangan`;
  }, [profile.school]);
  useEffect(() => {
    if (toast) {
      const timer = window.setTimeout(() => setToast(""), 2600);
      return () => window.clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    writeLocal("cendekia-read-notices", readNotices);
  }, [readNotices]);
  useEffect(() => {
    if (!noticeOpen) return;
    function handlePointer(event: PointerEvent) {
      if (!noticeRef.current?.contains(event.target as Node)) {
        setNoticeOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setNoticeOpen(false);
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [noticeOpen]);

  function openNotice(notice: Notice) {
    setReadNotices((current) =>
      current.includes(notice.id) ? current : [...current, notice.id],
    );
    setPage(notice.target);
    setNoticeOpen(false);
  }
  function markAllNoticesRead() {
    setReadNotices(notices.map((notice) => notice.id));
    setToast("Semua notifikasi ditandai sudah dibaca.");
  }

  /** Clear every audit-trail filter back to the default view. */
  function resetLogFilters() {
    setLogSearch("");
    setLogSearchTerm("");
    setLogCategory("");
    setLogFrom("");
    setLogTo("");
    setLogPage(1);
  }

  const pageTitles: Record<Page, string> = {
    dashboard: "Ringkasan",
    siswa: "Data siswa",
    pembayaran: "Pembayaran",
    laporan: "Laporan",
    pengaturan: "Pengaturan tarif",
    profil: "Profil sekolah",
    bendahara: "Kelola bendahara",
    log: "Log aktivitas",
    pemeliharaan: "Backup & cache",
    akun: "Akun saya",
  };
  const navGroups = emailVerified
    ? [
        {
          label: "MENU UTAMA",
          links: [
            { id: "dashboard" as Page, text: "Ringkasan", icon: LayoutDashboard },
            // Students and payments are shared with leadership: pimpinan needs the
            // same per-student view as the treasurer to supervise the books, so the
            // menu is shown to both roles rather than admin only.
            ...(currentUser?.role === "admin" || currentUser?.role === "pimpinan"
              ? [
                  { id: "siswa" as Page, text: "Data siswa", icon: Users },
                  { id: "pembayaran" as Page, text: "Pembayaran", icon: HandCoins },
                ]
              : []),
            { id: "laporan" as Page, text: "Laporan", icon: ClipboardList },
          ],
        },
        {
          label: "PREFERENSI",
          links: [
            ...(currentUser?.role === "pimpinan"
              ? [
                  {
                    id: "pengaturan" as Page,
                    text: "Pengaturan tarif",
                    icon: SlidersHorizontal,
                  },
                  { id: "profil" as Page, text: "Profil sekolah", icon: Building2 },
                  { id: "bendahara" as Page, text: "Kelola bendahara", icon: Wallet },
                  { id: "log" as Page, text: "Log aktivitas", icon: History },
                  { id: "pemeliharaan" as Page, text: "Backup & cache", icon: Database },
                ]
              : []),
          ],
        },
        { label: "AKUN", links: [{ id: "akun" as Page, text: "Akun saya", icon: UserCog }] },
      ]
    // Unverified accounts see only the screen where they can verify.
    : [
        {
          label: "VERIFIKASI",
          links: [{ id: "profil" as Page, text: "Verifikasi email", icon: UserCog }],
        },
      ];
  // Paginated students from `/admin/siswa`, enriched with payment/arrears data
  // already loaded from `/data/portal` (matched by student id). Server handles
  // pagination + search so the frontend never pulls hundreds of rows at once.
  const serverStudents = studentPageQuery.data?.data ?? [];
  const paginatedStudents = serverStudents.map((serverStudent) => {
    const local = students.find((s) => String(s.dbId) === String(serverStudent.id));
    return {
      id: String(serverStudent.id),
      dbId: serverStudent.id,
      name: serverStudent.full_name,
      className: serverStudent.class_level,
      nisn: serverStudent.nisn,
      paid: local?.paid ?? [],
      sppArrears: local?.sppArrears,
      nonSppArrears: local?.nonSppArrears,
      sppUnpaidCount: local?.sppUnpaidCount,
      sppTotalCount: local?.sppTotalCount,
    };
  });
  // Payment page filters the local student roster by the search box before
  // passing it to PaymentPage, which handles its own pagination.
  const filteredStudents = students.filter((student) =>
    `${student.name} ${student.id} ${student.nisn} ${student.className}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  // Figures come from the database, not from a hard-coded offset: received is the
  // sum of stored transactions, arrears is the sum of unpaid monthly bills.
  const totalPaid = portalQuery.data
    ? portalQuery.data.summary.total_received
    : transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const outstanding = portalQuery.data
    ? portalQuery.data.summary.spp_arrears
    : students.reduce(
        (sum, student) =>
          sum + Math.max(0, 12 - student.paid.length) * studentSppAmount(student, sppAmounts, classLevels),
        0,
      );
  const monthlyRevenue = portalQuery.data?.summary.monthly_revenue ?? [];
  const selectedSppAmount = selected
    ? studentSppAmount(selected, sppAmounts, classLevels)
    : 0;
  const selectedCost = activeCost;
  const selectedCostBill = paymentBillsQuery.data?.non_spp.find(
    (bill) => bill.position_rate_id === selectedCost?.rateId,
  );
  const remainingCost = Math.max(
    0,
    Number(selectedCostBill?.amount_due ?? selectedCost?.amount ?? 0) -
      Number(selectedCostBill?.amount_paid ?? 0),
  );
  const paidMonths = paymentBillsQuery.data?.spp
    .filter((bill) => bill.status === "lunas")
    .map((bill) => bill.month >= 7 ? bill.month - 7 : bill.month + 5)
    ?? selected?.paid
    ?? [];
  const sppAmountsByMonth = monthNames.map((_, index) => {
    const calendarMonth = index < 6 ? index + 7 : index - 5;
    const bill = paymentBillsQuery.data?.spp.find((item) => item.month === calendarMonth);
    return bill ? Number(bill.amount) : selectedSppAmount;
  });

  function openPayment(student: Student, kind: "spp" | "non-spp" = "spp") {
    setSelected(student);
    setPayKind(kind);
    setPayMonths([]);
    setPaymentError("");
    const studentRates = (portalQuery.data?.position_rates ?? []).filter((rate) => {
      const level = portalQuery.data?.class_levels.find(
        (item) => item.name === student.className,
      );
      return level ? rate.class_level_id === level.id : false;
    });
    const initialRate = studentRates[0];
    setPayCost(initialRate?.position ?? "");
    setPayAmount(initialRate?.amount ?? 0);
    setModal("payment");
  }
  async function savePayment() {
    if (!selected || paymentBusy) return;
    if (paymentBillsQuery.isLoading) {
      setPaymentError("Tunggu hingga tagihan siswa selesai dimuat.");
      return;
    }
    if (paymentBillsQuery.isError) {
      setPaymentError("Tagihan gagal dimuat. Muat ulang halaman pembayaran sebelum menyimpan.");
      return;
    }
    if (!selected.dbId) {
      setPaymentError("Data siswa tidak terhubung ke server, pembayaran tidak dapat disimpan.");
      return;
    }
    const yearId = effectiveYearId ?? portalQuery.data?.academic_year?.id;
    if (!yearId) {
      setPaymentError("Tahun ajaran belum tersedia. Pembayaran tidak dapat disimpan.");
      return;
    }
    if (payKind === "spp" && (payMonths.length === 0 || payMonths.some((month) => paidMonths.includes(month)))) {
      setPaymentError("Pilih bulan SPP yang belum lunas.");
      return;
    }
    if (payKind === "non-spp" && !selectedCost?.rateId) {
      setPaymentError("Pilih tarif biaya lain untuk tahun ajaran ini.");
      return;
    }
    const amount = payKind === "spp"
      ? payMonths.reduce((total, month) => total + sppAmountsByMonth[month], 0)
      : Math.min(payAmount, remainingCost);
    if (amount <= 0 || (payKind === "non-spp" && (
      amount > remainingCost ||
      (selectedCost?.type !== "Cicilan" && amount !== remainingCost)
    ))) {
      setPaymentError("Jumlah pembayaran tidak sesuai dengan sisa tagihan.");
      return;
    }

    setPaymentBusy(true);
    setPaymentError("");
    try {
      const saved = payKind === "spp"
        ? await paySpp({
            student_id: selected.dbId,
            academic_year_id: yearId,
            months: payMonths.map((month) => month < 6 ? month + 7 : month - 5),
          })
        : await payNonSpp({
            student_id: selected.dbId,
            position_rate_id: selectedCost!.rateId,
            amount,
          });
      const detail = payKind === "spp"
        ? `SPP · ${payMonths.map((month) => monthNames[month]).join(", ")}`
        : selectedCost?.name ?? "Biaya lain";
      const transaction: Transaction = {
        id: saved.transaction_number,
        student: selected.name,
        detail,
        date: new Date(saved.paid_at).toLocaleString("id-ID"),
        amount: Number(saved.amount),
        status: "Lunas",
        paidAt: saved.paid_at,
      };
      setTransactions((items) => [transaction, ...items]);
      setReceiptTransaction(transaction);
      setModal("receipt");
      setToast("Pembayaran berhasil disimpan.");
      void queryClient.invalidateQueries({ queryKey: ["portal-data"] });
      void queryClient.invalidateQueries({ queryKey: ["student-bills", selected.dbId] });
    } catch (error) {
      setPaymentError(paymentErrorMessage(error));
    } finally {
      setPaymentBusy(false);
    }
  }

  /** Open the correction form for one mis-keyed payment. */
  function openEditPayment(
    transaction: StudentTransaction,
    studentDbId: number,
    context: PaymentEditContext,
  ) {
    setEditTransaction(transaction);
    setEditPaymentStudentId(studentDbId);
    setEditPaymentContext(context);
    setEditPaymentError("");
  }

  /**
   * Save a correction and refresh everything the old figure touched.
   *
   * The portal feed, the student's bills and the history row are separate
   * caches; leaving any of them stale would show the corrected payment on one
   * screen and the wrong one on another.
   */
  async function saveEditPayment(input: UpdatePaymentInput) {
    if (!editTransaction || editPaymentBusy) return;

    const transactionNumber = editTransaction.number;
    const studentId = editPaymentStudentId;

    setEditPaymentBusy(true);
    setEditPaymentError("");
    try {
      await updatePaymentTransaction(transactionNumber, input);
      setEditTransaction(null);
      setToast(`Pembayaran ${transactionNumber} berhasil dikoreksi.`);
      void queryClient.invalidateQueries({ queryKey: ["portal-data"] });
      if (studentId !== undefined) {
        void queryClient.invalidateQueries({ queryKey: ["student-transactions", studentId] });
        void queryClient.invalidateQueries({ queryKey: ["student-bills", studentId] });
      }
    } catch (error) {
      setEditPaymentError(
        paymentErrorMessage(error, "Koreksi pembayaran gagal disimpan. Silakan coba kembali."),
      );
    } finally {
      setEditPaymentBusy(false);
    }
  }

  async function exportReport(
    format: "csv" | "xlsx" | "pdf" | "print",
    reportTransactions?: Transaction[],
    classFilter = "Semua kelas",
    monthFilter = "Semua bulan",
    sections?: ReportSections,
  ) {
    // Set before any branch, not inside them. The Reports page always passes its
    // own rows, so the `!exportRows` fetch below never ran for CSV/XLSX and the
    // flag stayed false for the whole generation — leaving all four export
    // buttons live and re-clickable while a file was being generated.
    setPdfLoading(true);

    // Resolve the row set once, on the server, so no export can inherit the
    // portal feed's 100-row cap. The Reports page passes rows it already
    // fetched for the active filters.
    let exportRows = reportTransactions;
    if (!exportRows) {
      try {
        const result = await fetchPaymentReport({ academicYearId: reportYearId });
        exportRows = result.rows.map(toTransaction);
        if (result.meta.truncated) {
          setToast("Laporan melebihi batas baris server dan terpotong. Buka halaman Laporan untuk memfilter.");
        }
      } catch {
        setToast("Laporan gagal dimuat dari server. Coba lagi.");
        setPdfLoading(false);
        return;
      }
    }

    if (format === "pdf" || format === "print") {
      try {
        // The SPP bill-status table is built from the student roster, and the
        // roster is year-scoped. If the report is about a different year than
        // the topbar, pulling the topbar's roster would mix two years on one
        // page — so fetch the matching roster instead.
        let reportStudents = students;
        if (reportYearId !== effectiveYearId && reportYearId !== null) {
          const portal = await fetchPortalData(reportYearId);
          reportStudents = portal.students.map((student) => ({
            id: student.student_number,
            dbId: student.id,
            name: student.name,
            className: student.class_name,
            nisn: student.nisn,
            paid: student.paid_months,
            sppArrears: student.spp_arrears,
            nonSppArrears: student.non_spp_arrears,
            sppUnpaidCount: student.spp_unpaid_count,
            sppTotalCount: student.spp_total_count,
          }));
        }

        const { downloadPaymentReport } = await import("./reportPdf");
        await downloadPaymentReport({
          school: {
            ...profile,
            logo: schoolProfileQuery.data?.logo_path
              ? publicStorageUrl(schoolProfileQuery.data.logo_path)
              : profile.logo,
          },
          user: currentUser ?? { name: "Petugas Keuangan", role: "admin", nip: null },
          transactions: exportRows,
          students: reportStudents.map((student) => ({
            name: student.name,
            className: student.className,
            paid: student.paid,
            sppArrears: student.sppArrears ?? 0,
            sppUnpaidCount: student.sppUnpaidCount ?? 0,
            sppTotalCount: student.sppTotalCount ?? 0,
          })),
          classFilter,
          monthFilter,
          academicYearLabel: reportYearLabel,
          // The dashboard's own Print button passes no sections, so it falls
          // back to the full report there.
          sections: sections ?? reportSections,
          mode: format === "print" ? "print" : "download",
        });
        setToast(
          format === "print"
            ? "Laporan dibuka di tab baru, siap dicetak."
            : "Laporan PDF berhasil diunduh.",
        );
      } catch {
        setToast("PDF gagal dibuat. Coba periksa kembali data laporan.");
      } finally {
        setPdfLoading(false);
      }
      return;
    }

    const schoolName = profile.foundation.trim() || profile.school.trim();
    const meta = {
      school: schoolName || "Laporan Pembayaran Sekolah",
      // The year the report was filtered to, not the one the rest of the app
      // happens to be showing — otherwise a spreadsheet of 2023/2024 would be
      // headed "2026 / 2027" and quietly disagree with the rows beneath it.
      academicYearLabel: reportYearLabel,
      classFilter,
      monthFilter,
      printedAt: new Date().toLocaleString("id-ID"),
    };
    const slug = `${new Date().toISOString().slice(0, 10)}`;
    // Include the scope in the filename: a treasurer exporting several years
    // should not end up with a folder of identically named files.
    const scopeSlug = reportYearLabel.replace(/[^0-9]+/g, "-");

    try {
      if (format === "csv") {
        const { downloadReportCsv } = await import("./reportExport");
        downloadReportCsv(
          exportRows,
          meta,
          `laporan-pembayaran-${scopeSlug}-${slug}.csv`,
        );
        setToast("Laporan CSV berhasil diunduh.");
      } else {
        const { downloadReportXlsx } = await import("./reportExport");
        await downloadReportXlsx(exportRows, meta);
        setToast("Laporan Excel berhasil diunduh.");
      }
    } catch {
      setToast("Ekspor gagal. Coba ulangi atau periksa izin unduhan browser.");
    } finally {
      setPdfLoading(false);
    }
  }
  async function exportStudentReport(
    student: Student,
    mode: "download" | "print",
    printWindow?: Window | null,
  ) {
    if (mode === "print" && !printWindow) {
      setToast("Jendela cetak diblokir browser. Izinkan pop-up lalu coba lagi.");
      return;
    }

    // A student's report is a statement of everything they paid, so it is read
    // from the server rather than from the capped portal feed. Without this a
    // pupil with more than 100 payments would get a report that silently stops
    // early and totals less than the arrears it is meant to explain.
    setPdfLoading(true);
    let studentTransactions: Transaction[];
    try {
      const result = await fetchPaymentReport({
        academicYearId: effectiveYearId,
        studentId: student.dbId,
      });
      studentTransactions = result.rows.map(toTransaction);
      if (result.meta.truncated) {
        setToast(
          `Laporan ${student.name} melebihi batas baris server dan terpotong.`,
        );
      }
    } catch {
      setPdfLoading(false);
      printWindow?.close();
      setToast(`Laporan ${student.name} gagal dimuat dari server. Coba lagi.`);
      return;
    }
    setPdfLoading(false);

    if (mode === "print") {
      try {
        const { fetchSchoolLogoDataUrl } = await import("./api");
        const logoDataUrl = await fetchSchoolLogoDataUrl();

        printStudentReportPage({
          printWindow: printWindow!,
          school: {
            ...profile,
            logo: schoolProfileQuery.data?.logo_path
              ? publicStorageUrl(schoolProfileQuery.data.logo_path)
              : profile.logo,
          },
          student,
          transactions: studentTransactions,
          academicYearLabel: academicYear,
          printedTime: new Date().toLocaleString("id-ID"),
          logoDataUrl,
          user: currentUser ?? { name: "Petugas Keuangan", role: "admin", nip: null },
        });
        setToast(`Laporan ${student.name} dibuka untuk dicetak.`);
      } catch {
        printWindow?.close();
        setToast(`Laporan ${student.name} gagal dibuka untuk dicetak.`);
      }
      return;
    }

    setPdfLoading(true);
    try {
      const { downloadStudentReport } = await import("./reportPdf");
      await downloadStudentReport({
        school: {
          ...profile,
          logo: schoolProfileQuery.data?.logo_path
            ? publicStorageUrl(schoolProfileQuery.data.logo_path)
            : profile.logo,
        },
        student,
        transactions: studentTransactions,
        academicYearLabel: academicYear,
        mode: "download",
        printWindow,
        user: currentUser ?? { name: "Petugas Keuangan", role: "admin", nip: null },
      });
      setToast(
        `Laporan ${student.name} berhasil diunduh.`,
      );
    } catch {
      printWindow?.close();
      setToast(`Laporan ${student.name} gagal dibuat. Coba lagi.`);
    } finally {
      setPdfLoading(false);
    }
  }
  async function addStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const className = String(form.get("className"));
    const level = classLevelRows.find((item) => item.name === className);
    if (!level) {
      setModal(null);
      setToast("Tingkat kelas tidak ditemukan. Muat ulang halaman lalu coba lagi.");
      return;
    }

    setStudentBusy(true);
    try {
      await createStudent({
        nisn: String(form.get("nisn")).trim(),
        student_number: String(form.get("id")).trim(),
        full_name: String(form.get("name")).trim(),
        class_level_id: level.id,
      });
      setModal(null);
      // Refetch rather than pushing a local row: the portal response is what
      // carries the student's primary key, and a locally invented one has none.
      // Without it every payment attempt on the new record is refused.
      await queryClient.invalidateQueries({ queryKey: ["portal-data"] });
      setToast("Data siswa berhasil ditambahkan.");
    } catch (error) {
      setModal(null);
      setToast(
        validationMessage(error, "nisn") ??
          validationMessage(error, "student_number") ??
          validationMessage(error, "full_name") ??
          validationMessage(error, "class_level_id") ??
          (isNetworkFailure(error)
            ? "Server tidak dapat dihubungi. Siswa belum tersimpan."
            : "Data siswa gagal disimpan."),
      );
    } finally {
      setStudentBusy(false);
    }
  }
  async function uploadLogo(file?: File) {
    if (!file || logoBusy) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setToast("Gunakan PNG, JPG, atau WebP maksimal 2 MB.");
      return;
    }
    if (currentUser?.role !== "pimpinan") {
      setToast("Hanya pimpinan yang dapat mengubah logo.");
      return;
    }
    // The logo must live on the server: a data URL kept only in this browser
    // would never reach receipts, the login screen of another device, or the
    // public profile every client reads.
    setLogoBusy(true);
    try {
      const saved = await uploadSchoolLogo(file);
      setProfile((value) => ({
        ...value,
        logo: saved.logo_path ? publicStorageUrl(saved.logo_path) : "",
      }));
      await queryClient.invalidateQueries({ queryKey: ["public-school-profile"] });
      setToast("Logo sekolah berhasil diperbarui.");
    } catch (error) {
      setToast(brandingErrorMessage(error, "Logo gagal diunggah. Coba lagi."));
    } finally {
      setLogoBusy(false);
    }
  }
  async function handleFaviconUpload(file?: File) {
    if (!file || faviconBusy) return;
    const invalid = validateFaviconFile(file);
    if (invalid) {
      setToast(invalid);
      return;
    }
    if (currentUser?.role !== "pimpinan") {
      setToast("Hanya pimpinan yang dapat mengubah favicon.");
      return;
    }
    setFaviconBusy(true);
    try {
      const saved = await uploadSchoolFavicon(file);
      setProfile((value) => ({
        ...value,
        favicon: saved.favicon_path
          ? publicStorageUrl(saved.favicon_path)
          : value.favicon,
      }));
      await queryClient.invalidateQueries({ queryKey: ["public-school-profile"] });
      setToast("Favicon sekolah berhasil diperbarui.");
    } catch (error) {
      setToast(faviconErrorMessage(error));
    } finally {
      setFaviconBusy(false);
    }
  }
  async function handleFaviconRemove() {
    if (faviconBusy) return;
    if (currentUser?.role !== "pimpinan") {
      setToast("Hanya pimpinan yang dapat mengubah favicon.");
      return;
    }
    setFaviconBusy(true);
    try {
      await deleteSchoolFavicon();
      setProfile((value) => ({ ...value, favicon: "" }));
      await queryClient.invalidateQueries({ queryKey: ["public-school-profile"] });
      setToast("Favicon dikembalikan ke ikon bawaan.");
    } catch (error) {
      setToast(faviconErrorMessage(error));
    } finally {
      setFaviconBusy(false);
    }
  }
  /**
   * Push the identity form to the database. The same button also carries the
   * theme colours when they differ from the server value: the editor presents
   * colours and identity as one branding screen, and historically the colour
   * preview only lived in localStorage here — silently reverting to the server
   * default on the next reload.
   */
  async function handleProfileSave() {
    if (profileBusy) return;
    if (currentUser?.role !== "pimpinan") {
      setToast("Hanya pimpinan yang dapat mengubah identitas sekolah.");
      return;
    }
    if (!profile.school.trim() || !profile.address.trim()) {
      setToast("Nama sekolah dan alamat wajib diisi.");
      return;
    }
    setProfileBusy(true);
    try {
      let saved: SchoolProfile;
      try {
        saved = await saveSchoolProfile({
          school_name: profile.school.trim(),
          foundation_name: profile.foundation.trim() || null,
          address: profile.address.trim(),
          phone: profile.phone.trim() || null,
          email: profile.email.trim() || null,
          receipt_note: profile.note.trim() || null,
          bank_name: profile.bankName.trim() || null,
          bank_account_number: profile.bankAccountNumber.trim() || null,
          bank_account_holder: profile.bankAccountHolder.trim() || null,
        });
      } catch (error) {
        setToast(
          brandingErrorMessage(error, "Profil sekolah gagal disimpan. Coba lagi."),
        );
        return;
      }
      setProfile((value) => ({
        ...value,
        school: saved.school_name,
        foundation: saved.foundation_name ?? "",
        address: saved.address,
        phone: saved.phone ?? "",
        email: saved.email ?? "",
        note: saved.receipt_note ?? "",
        bankName: saved.bank_name ?? "",
        bankAccountNumber: saved.bank_account_number ?? "",
        bankAccountHolder: saved.bank_account_holder ?? "",
      }));

      try {
        const server = queryClient.getQueryData<PublicSchoolProfile>([
          "public-school-profile",
        ]);
        const primary = normalizeHex(profile.themePrimary, "#24634e");
        const accent = normalizeHex(profile.themeAccent, "#c88942");
        if (
          server &&
          (primary !== server.theme_primary || accent !== server.theme_accent)
        ) {
          await saveSchoolTheme(primary, accent);
        }
      } catch (error) {
        // The identity half made it; say so instead of reporting a total failure.
        await queryClient.invalidateQueries({ queryKey: ["public-school-profile"] });
        setToast(
          brandingErrorMessage(
            error,
            "Identitas tersimpan, tetapi tema warna gagal disimpan.",
          ),
        );
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["public-school-profile"] });
      setToast("Profil sekolah berhasil disimpan ke server.");
    } finally {
      setProfileBusy(false);
    }
  }
  async function handleThemeSave(primary: string, accent: string) {
    if (themeBusy) return;
    if (currentUser?.role !== "pimpinan") {
      setToast("Hanya pimpinan yang dapat mengubah tema.");
      return;
    }
    if (!isHexColor(primary) || !isHexColor(accent)) {
      setToast("Warna harus berupa kode heksadesimal, contoh #24634e.");
      return;
    }
    const nextPrimary = normalizeHex(primary, profile.themePrimary);
    const nextAccent = normalizeHex(accent, profile.themeAccent);
    setThemeBusy(true);
    // Preview instantly so the change is visible before the round trip finishes.
    setProfile((value) => ({
      ...value,
      themePrimary: nextPrimary,
      themeAccent: nextAccent,
    }));
    try {
      await saveSchoolTheme(nextPrimary, nextAccent);
      await queryClient.invalidateQueries({ queryKey: ["public-school-profile"] });
      setToast("Tema warna berhasil disimpan untuk semua pengguna.");
    } catch (error) {
      // Roll the preview back to what the server actually holds. Restoring the
      // same (already-overwritten) buffer values would leave the CSS showing
      // colours that were never saved.
      const server = queryClient.getQueryData<PublicSchoolProfile>([
        "public-school-profile",
      ]);
      if (server) {
        setProfile((value) => ({
          ...value,
          themePrimary: server.theme_primary,
          themeAccent: server.theme_accent,
        }));
        applyTheme(server.theme_primary, server.theme_accent);
      }
      await queryClient.invalidateQueries({ queryKey: ["public-school-profile"] });
      setToast(brandingErrorMessage(error, "Tema warna gagal disimpan. Coba lagi."));
    } finally {
      setThemeBusy(false);
    }
  }
  /**
   * Free both cache layers so the portal runs on fresh server data: the
   * read-only localStorage snapshots (session keys and small preferences are
   * deliberately kept) and the React Query entries no screen is looking at.
   * The queries still on screen refetch from the server, and their results
   * rewrite the localStorage snapshots — nothing stays stale anywhere.
   */
  async function handleClearCache() {
    if (cacheBusy) return;
    setCacheBusy(true);
    try {
      const freed = clearReadCaches();
      queryClient.removeQueries({
        predicate: (query) => query.getObserversCount() === 0,
      });
      // Active queries keep their current data on screen while reloading, so
      // clearing never blanks the page; throwOnError keeps a flaky network
      // from turning the toast into an unhandled rejection.
      await queryClient.invalidateQueries(undefined, { throwOnError: false });
      setToast(`Cache dibersihkan (±${formatBytes(freed)}). Data dimuat ulang dari server.`);
    } finally {
      setCacheBusy(false);
    }
  }
  /**
   * Return the app to a signed-out, empty state.
   *
   * Clearing the token was never enough on its own. The mirrored school data
   * lives in React state as well as localStorage, so after signing out, letting
   * the session lapse, or a token being rejected, the next person to sign in on
   * that browser was shown the previous account's students, transactions and
   * school profile until their own requests came back — and kept seeing them if
   * those requests failed.
   */
  function resetSignedInState(message?: string) {
    // Read the caches *after* they have been removed, so this restores the empty
    // defaults rather than the account that just signed out.
    setStudents(initialStudents);
    setTransactions(initialTransactions);
    setProfile(readProfile());
    setSppAmounts(initialSppRates);
    queryClient.clear();
    setCurrentUser(null);
    setPage("dashboard");
    setActiveTab("spp");
    setReportMonth(0);
    setReportClassId(null);
    setReportYearOverride(null);
    setCostClassId(null);
    setSppDrafts({});
    setCostDrafts({});
    setCostToggles({});
    if (message) setToast(message);
  }

  async function handleLogout() {
    // Revoke the token server-side when possible, but never block the exit on it:
    // an offline or expired backend must still clear the local session.
    try {
      await logoutApi();
    } catch {
      /* ignore */
    }
    clearSessionActivity();
    // Silent: signing out is a deliberate act, and the announcement exists to
    // explain the *unexpected* cases. Storage is still cleared, so other tabs
    // still follow this one out.
    purgeSession({ silent: true });
    resetSignedInState();
  }

  /** Drop the session without a round trip, used when it expires. */
  function handleSessionExpired() {
    clearSessionActivity();
    // Announced with the reason attached, because an idle sign-out should say
    // why it happened rather than looking like an unexplained error.
    purgeSession();
    setToast("Sesi berakhir karena tidak ada aktivitas. Silakan masuk kembali.");
  }

  // End the session after a period of inactivity, and follow another tab out
  // when it signs out. A 15 minute limit is short enough that a silent sign-out
  // would feel arbitrary, so the banner warns first.
  const { remainingMs, keepAlive } = useIdleLogout(
    Boolean(currentUser),
    handleSessionExpired,
  );
  const idleWarningMs =
    remainingMs !== null && remainingMs < IDLE_WARNING_MS ? remainingMs : null;

  /** Replace the signed-in user's avatar, then refresh every screen showing it. */
async function handlePhotoUpload(file: File) {
    if (photoBusy) return;
    const invalid = validatePhotoFile(file);
    if (invalid) {
      setPhotoError(invalid);
      return;
    }
    setPhotoBusy(true);
    setPhotoError("");
    try {
      const updated = await uploadProfilePhoto(file);
      storeSession(readToken() ?? "", updated);
      setCurrentUser(updated);
      setToast("Foto profil berhasil diperbarui.");
      await queryClient.invalidateQueries({ queryKey: ["account"] });
    } catch (error) {
      setPhotoError(
        validationMessage(error, "photo") ??
          (isNetworkFailure(error)
            ? "Server tidak dapat dihubungi. Coba lagi beberapa saat."
            : "Foto profil gagal diunggah."),
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  /** Remove the avatar; every surface falls back to initials again. */
  async function handlePhotoRemove() {
    if (photoBusy) return;
    setPhotoBusy(true);
    setPhotoError("");
    try {
      const updated = await deleteProfilePhoto();
      storeSession(readToken() ?? "", updated);
      setCurrentUser(updated);
      setToast("Foto profil dihapus.");
      await queryClient.invalidateQueries({ queryKey: ["account"] });
    } catch (error) {
      setPhotoError(
        isNetworkFailure(error)
          ? "Server tidak dapat dihubungi. Coba lagi beberapa saat."
          : "Foto profil gagal dihapus.",
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  /** Persist a new address from the verification card. */
  async function handleSaveVerificationEmail() {
    if (verifyBusy || !emailDirty || emailDraft === null || !currentUser) return;
    setVerifyBusy(true);
    setVerifyError("");
    setVerifyNotice("");
    try {
      const updated = await updateAccount({
        name: currentUser.name,
        username: currentUser.username,
        email: emailDraft.trim(),
      });
      storeSession(readToken() ?? "", updated);
      setCurrentUser(updated);
      setEmailDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["account"] });
      setToast("Alamat email diperbarui. Kirim kode untuk verifikasi.");
    } catch (error) {
      setVerifyError(
        validationMessage(error, "email") ??
          validationMessage(error, "username") ??
          (isNetworkFailure(error)
            ? "Server tidak dapat dihubungi. Coba lagi beberapa saat."
            : "Alamat email gagal diperbarui."),
      );
    } finally {
      setVerifyBusy(false);
    }
  }

  /** Request a fresh verification code for the signed-in account. */
  async function handleSendVerification() {
    if (verifyBusy) return;
    setVerifyBusy(true);
    setVerifyError("");
    setVerifyNotice("");
    try {
      await sendVerificationCode();
      setVerifyNotice("Kode verifikasi telah dikirim ke email akun Anda.");
    } catch (error) {
      setVerifyError(
        validationMessage(error, "code") ??
          (isNetworkFailure(error)
            ? "Server tidak dapat dihubungi. Coba lagi beberapa saat."
            : "Kode verifikasi gagal dikirim. Coba lagi."),
      );
    } finally {
      setVerifyBusy(false);
    }
  }

  /** Submit the emailed code and lift the gate once the server confirms it. */
  async function handleVerifyEmail(code: string) {
    if (verifyBusy) return;
    setVerifyBusy(true);
    setVerifyError("");
    setVerifyNotice("");
    try {
      await verifyEmailCode(code);
      // Verification is already committed server-side. The refetches below are
      // only cosmetic refreshes, and `invalidateQueries` rejects when any of
      // them fail — with `retry: false` a single blip was enough to report a
      // correct code as "ditolak", while the account was in fact verified.
      // Refreshing the account data must never decide the outcome of a submit
      // that the server already accepted.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["account"] }, { throwOnError: false }),
        queryClient.invalidateQueries({ queryKey: ["portal-data"] }, { throwOnError: false }),
      ]);
      setToast("Email terverifikasi. Seluruh fitur portal kini aktif.");
      setPage("dashboard");
    } catch (error) {
      // Same three-way split as login: a 429 means the throttle is doing its
      // job — the code may even be right — so blaming it would send people
      // re-typing a correct code into a locked endpoint.
      setVerifyError(
        isRateLimited(error)
          ? "Terlalu banyak percobaan verifikasi. Tunggu satu menit, lalu coba lagi."
          : validationMessage(error, "code") ?? "Kode verifikasi ditolak. Coba lagi.",
      );
    } finally {
      setVerifyBusy(false);
    }
  }

  async function handleAccountSave(
    name: string,
    username: string,
    email: string,
    nip: string,
  ) {
    if (accountBusy) return;
    setAccountBusy(true);
    setAccountError("");
    try {
      const updated = await updateAccount({ name, username, email, nip });
      storeSession(readToken() ?? "", updated);
      setCurrentUser(updated);
      setToast("Data akun berhasil diperbarui.");
      await queryClient.invalidateQueries({ queryKey: ["account"] });
    } catch (error) {
      setAccountError(
        validationMessage(error, "username") ??
          validationMessage(error, "email") ??
          validationMessage(error, "name") ??
          validationMessage(error, "nip") ??
          (isNetworkFailure(error)
            ? "Server tidak dapat dihubungi. Coba lagi beberapa saat."
            : "Data akun gagal disimpan."),
      );
    } finally {
      setAccountBusy(false);
    }
  }

  async function handlePasswordSave(input: {
    current_password: string;
    password: string;
    password_confirmation: string;
  }) {
    if (accountBusy) return;
    setAccountBusy(true);
    setPasswordError("");
    setPasswordNotice("");
    try {
      const result = await changePassword(input);
      setPasswordNotice(result.message);
      setToast(result.message);
      await queryClient.invalidateQueries({ queryKey: ["account"] });
    } catch (error) {
      setPasswordError(
        validationMessage(error, "current_password") ??
          validationMessage(error, "password") ??
          (isNetworkFailure(error)
            ? "Server tidak dapat dihubungi. Coba lagi beberapa saat."
            : "Kata sandi gagal diubah."),
      );
    } finally {
      setAccountBusy(false);
    }
  }

  /*
   * The splash covers signing in and the first data round that follows it.
   *
   * On a refresh those queries are pending too, but a reload already has the
   * last-known figures mirrored in `localStorage`, so blanking the whole
   * interface for them would be a regression — `bootingAfterLogin` is only set
   * by an actual sign-in, which is the one moment there is nothing to draw yet.
   *
   * `bootTimedOut` is the escape hatch. If the server is slow the app opens
   * anyway rather than leaving the user staring at a spinner after they already
   * proved they can log in.
   */
  const showBootSplash = authLoading || (bootingAfterLogin && !bootReady && !bootTimedOut);

  if (showBootSplash) {
    return (
      <LoadingScreen
        school={profile.school}
        logo={profile.logo}
        message={authLoading ? "Memverifikasi akun" : pendingBootLabel}
      />
    );
  }

  if (!currentUser) {
    if (authMode === "forgot") {
      return (
        <ForgotPasswordPage
          school={profile.school}
          logo={profile.logo}
          error={authError}
          notice={recoverNotice}
          initialToken={entry.token}
          expiresAt={entry.expiresAt}
          onBackToLogin={() => {
            setEntry({ mode: "login", token: "", expiresAt: 0 });
            setAuthMode("login");
            setAuthError("");
            setRecoverNotice("");
          }}
          onRequestCode={async (email) => {
            setAuthError("");
            try {
              await forgotPassword(email);
              setRecoverNotice(
                "Jika data tersebut terdaftar, tautan atur ulang sudah dikirim ke email akun.",
              );
              setToast("Tautan atur ulang sudah dikirim ke email Anda.");
            } catch (error) {
              // A 429 here means this IP asked too often — the request may
              // never have reached the mailer, so the generic "failed" wording
              // would be wrong about what happened.
              setAuthError(
                isRateLimited(error)
                  ? "Terlalu banyak permintaan. Tunggu satu menit, lalu coba lagi."
                  : validationMessage(error, "email") ??
                    "Permintaan gagal. Silakan coba beberapa saat lagi.",
              );
            }
          }}
          onReset={async (token, password) => {
            setAuthError("");
            try {
              await resetPassword({
                token,
                password,
                password_confirmation: password,
              });
              setRecoverNotice("Kata sandi berhasil diubah. Silakan masuk kembali.");
              setEntry({ mode: "login", token: "", expiresAt: 0 });
              setAuthMode("login");
            } catch (error) {
              setAuthError(
                isRateLimited(error)
                  ? "Terlalu banyak percobaan reset. Tunggu satu menit, lalu coba lagi."
                  : validationMessage(error, "token") ??
                    validationMessage(error, "password") ??
                    "Kode tidak berlaku. Minta kode baru lalu coba lagi.",
              );
              throw error;
            }
          }}
        />
      );
    }

    return (
      <LoginPage
        school={profile.school}
        logo={profile.logo}
        error={authError}
        onForgotPassword={() => {
          setAuthError("");
          setRecoverNotice("");
          setAuthMode("forgot");
        }}
        onSubmit={async (username, password) => {
          setAuthError("");
          setAuthLoading(true);
          try {
            const session = await loginApi(username, password);
            // A different account must never inherit profile or portal data
            // cached under the previous authenticated session.
            queryClient.clear();
            // Opening the idle window here means the countdown starts at login,
            // not at whatever timestamp a previous visit left behind.
            startSession();
            setCurrentUser(session.user);
            // Hold the splash until the first data round lands, so the shell
            // never appears with empty figures it would immediately replace.
            setBootTimedOut(false);
            setBootingAfterLogin(true);
            setPage("dashboard");
          } catch (error) {
            // A dead/unreachable backend looks identical to a bad password unless
            // we separate the two, which previously sent people hunting for a typo.
            // A 429 is a third case: the credentials may well be right, but the
            // login throttle (`throttle:10,1`) has locked this IP for the minute,
            // so blaming the password would push people into retyping it.
            // A timeout is a fourth: the server answered nothing in time but is
            // very much alive, and telling someone to go restart it sends them
            // off to fix a process that was working.
            //
            // `isNetworkFailure` also catches a response the browser threw away
            // because the origin is not on the backend's CORS list — which is what
            // happens whenever Vite drifts off port 5173 while `CORS_ALLOWED_ORIGINS`
            // still names 5173. The backend logs the 200 all the same, so "restart
            // the backend" is the one instruction that cannot be right: the request
            // reached it. Name the second cause instead of assuming the only one.
            setAuthError(
              isTimeout(error)
                ? "Server terlalu lama menjawab. Coba lagi sebentar."
                : isNetworkFailure(error)
                  ? "Server tidak dapat dihubungi. Kalau backend sudah berjalan, periksa asal halaman ini: port Vite harus sama dengan CORS_ALLOWED_ORIGINS di .env."
                  : isRateLimited(error)
                    ? "Terlalu banyak percobaan login. Tunggu satu menit, lalu coba lagi."
                    : "Username atau kata sandi tidak sesuai.",
            );
          } finally {
            setAuthLoading(false);
          }
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        currentUser={currentUser}
        emailVerified={emailVerified}
        profile={profile}
        page={page}
        navGroups={navGroups}
        mobileNav={mobileNav}
        setPage={setPage}
        setMobileNav={setMobileNav}
        handleLogout={handleLogout}
      />

      <main className="main-area">
      <Topbar
        page={page}
        pageTitles={pageTitles}
        setPage={setPage}
        setMobileNav={setMobileNav}
        currentUser={currentUser}
        academicYears={academicYears}
        canManageYears={canManageYears}
        onSelectYear={selectYear}
        onCreateYear={createYear}
        onActivate={activateYear}
        selectedYearId={effectiveYearId}
        portalQuerying={yearBusy || portalQuery.isFetching}
        today={today}
        notices={notices}
        unreadCount={unreadCount}
        readNotices={readNotices}
        noticeOpen={noticeOpen}
        noticeRef={noticeRef}
        setNoticeOpen={setNoticeOpen}
        openNotice={openNotice}
        markAllNoticesRead={markAllNoticesRead}
      />
        <section className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {today.upper} <span className="live-dot" /> DATA TERBARU
              </div>
              <h1>
                {effectivePage === "dashboard"
                  ? `Selamat ${greetingPart(now)}, ${currentUser.name.split(" ")[0]}`
                  : pageTitles[page]}
              </h1>
              <p>
                {effectivePage === "dashboard"
                  ? "Berikut ringkasan keuangan sekolah hari ini."
                  : page === "pembayaran"
                    ? "Kelola pembayaran SPP dan biaya pendidikan siswa."
                    : page === "siswa"
                      ? "Kelola data siswa dan pantau status pembayaran."
                      : page === "pengaturan"
                        ? "Atur tarif SPP dan pos biaya sesuai kebijakan sekolah."
                        : page === "profil"
                          ? "Identitas sekolah yang tampil di kuitansi dan laporan."
                          : page === "bendahara"
                            ? "Kelola akun bendahara yang mencatat pembayaran."
                            : page === "log"
                              ? "Jejak aktivitas pimpinan dan bendahara di portal."
                              : page === "pemeliharaan"
                                ? "Unduh backup database atau bersihkan cache aplikasi."
                              : "Pantau realisasi penerimaan dan tunggakan sekolah."}
              </p>
            </div>
            {effectivePage === "siswa" && (
              <button
                className="button button-primary"
                onClick={() => setModal("student")}
              >
                <Plus size={17} /> Tambah siswa
              </button>
            )}
          </div>

          {effectivePage === "dashboard" && (
            <Dashboard
              students={students}
              transactions={transactions}
              totalPaid={totalPaid}
              outstanding={outstanding}
              sppPaidCount={portalQuery.data?.summary.spp_paid_count ?? 0}
              sppUnpaidCount={portalQuery.data?.summary.spp_unpaid_count ?? 0}
              sppTotalCount={portalQuery.data?.summary.spp_total_count ?? 0}
              monthlyRevenue={monthlyRevenue}
              now={now}
              academicYearLabel={academicYear}
              academicStartYear={academicStartYear}
              classLevels={classLevels}
              academicYears={academicYears}
              canManageYears={canManageYears}
              onActivateYear={activateYear}
              onSelectYear={selectYear}
              onCreateYear={createYear}
              selectedYearId={effectiveYearId}
              portalQuerying={yearBusy || portalQuery.isFetching}
              onGo={setPage}
              onReceipt={(item) => {
                setReceiptTransaction(item);
                setModal("receipt");
              }}
            />
          )}
          {effectivePage === "siswa" && (
            <StudentsPage
              students={paginatedStudents}
              total={studentPageQuery.data?.meta?.total ?? 0}
              currentPage={studentPageQuery.data?.meta?.current_page ?? 1}
              perPage={studentPageQuery.data?.meta?.per_page ?? 10}
              onPageChange={setStudentPage}
              sppAmounts={sppAmounts}
              classLevels={classLevels}
              search={studentSearch}
              setSearch={(value) => {
                setStudentSearch(value);
                setStudentPage(1);
              }}
              onPay={openPayment}
              onReport={(student, mode, printWindow) =>
                void exportStudentReport(student, mode, printWindow)
              }
              reportBusy={pdfLoading}
            />
          )}
          {effectivePage === "pembayaran" && (
            <PaymentPage
              students={filteredStudents}
                sppAmounts={sppAmounts}
                classLevels={classLevels}
                search={search}
                setSearch={setSearch}
                onPay={openPayment}
                onEditPayment={openEditPayment}
                academicYears={academicYears}
                selectedYearId={effectiveYearId}
                onSelectYear={selectYear}
              />
            )}
            {effectivePage === "laporan" && (
            <ReportsPage
              rows={reportRows}
              loading={paymentReportQuery.isLoading}
              loadError={
                paymentReportQuery.isError
                  ? "Laporan gagal dimuat. Coba ubah filter atau muat ulang."
                  : ""
              }
              truncated={paymentReportQuery.data?.meta.truncated ?? false}
              classLevels={classLevelRows}
              academicYearLabel={academicYear}
              yearOptions={academicYears
                .slice()
                .sort((a, b) => b.start_year - a.start_year)
                .map((year) => ({ id: year.id, name: year.name }))}
              reportYearId={reportYearOverride}
              setReportYearId={setReportYearOverride}
              reportClassId={reportClassId}
              setReportClassId={setReportClassId}
              reportMonth={reportMonth}
              setReportMonth={setReportMonth}
              sections={reportSections}
              setSections={setReportSections}
              onExport={exportReport}
              busy={pdfLoading}
            />
          )}
          {effectivePage === "pengaturan" && (
            <SettingsPage
              academicYearLabel={academicYear}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              busy={tariffBusy}
              error={tariffError}
              lastSavedAt={lastTariffSavedAt}
              sppRows={sppRows}
              onSppAmountChange={(classLevelId, amount) =>
                setSppDrafts((current) => ({ ...current, [classLevelId]: amount }))
              }
              onSaveSpp={saveSpp}
              costRows={costRows}
              costClassId={effectiveCostClassId}
              costClassLevels={classLevelRows}
              onSetCostClass={setCostClassId}
              onCostAmountChange={(paymentPositionId, amount) =>
                setCostDrafts((current) => ({ ...current, [paymentPositionId]: amount }))
              }
              onTogglePosition={togglePosition}
              onSaveCosts={saveCosts}
              onAddPosition={addPosition}
              onDeletePosition={removePosition}
            />
          )}
          {effectivePage === "bendahara" && (
            <BendaharaPage
              treasurers={treasurersQuery.data ?? []}
              loading={treasurersQuery.isLoading}
              busy={treasurerBusy}
              error={treasurerError}
              onCreate={addTreasurer}
              onUpdate={editTreasurer}
              onResetPassword={changeTreasurerPassword}
              onToggleActive={toggleTreasurer}
              onDelete={removeTreasurer}
            />
          )}
          {effectivePage === "log" && (
            <ActivityLogPage
              category={logCategory}
              error={
                activityLogQuery.isError
                  ? isNetworkFailure(activityLogQuery.error)
                    ? "Server tidak dapat dihubungi. Coba lagi beberapa saat."
                    : "Log aktivitas gagal dimuat."
                  : ""
              }
              from={logFrom}
              loading={activityLogQuery.isFetching}
              onCategoryChange={(value) => {
                setLogCategory(value);
                setLogPage(1);
              }}
              onFromChange={(value) => {
                setLogFrom(value);
                setLogPage(1);
              }}
              onPageChange={setLogPage}
              onPurge={async () => {
                try {
                  const { message } = await purgeActivityLogs();
                  // Page 1: with one row left, any higher page is now out of
                  // range and the list would render empty for no reason.
                  setLogPage(1);
                  setLogSearch("");
                  setLogCategory("");
                  setLogFrom("");
                  setLogTo("");
                  await activityLogQuery.refetch();
                  setToast(message);
                } catch (error) {
                  setToast(
                    isNetworkFailure(error)
                      ? "Server tidak dapat dihubungi. Log tidak berubah."
                      : isRateLimited(error)
                        ? "Terlalu banyak percobaan hapus. Tunggu satu menit lalu coba lagi."
                        : "Log aktivitas gagal dihapus.",
                  );
                }
              }}
              onReset={resetLogFilters}
              onSearchChange={setLogSearch}
              onToChange={(value) => {
                setLogTo(value);
                setLogPage(1);
              }}
              page={logPage}
              result={activityLogQuery.data}
              search={logSearch}
              to={logTo}
            />
          )}
          {effectivePage === "pemeliharaan" && <MaintenancePage />}
          {effectivePage === "profil" && (
            <ProfilePage
              verification={
                <EmailVerificationCard
                  verified={emailVerified}
                  email={emailDraft ?? storedEmail}
                  emailDirty={emailDirty}
                  busy={verifyBusy}
                  notice={verifyNotice}
                  error={verifyError}
                  onChangeEmail={setEmailDraft}
                  onSaveEmail={handleSaveVerificationEmail}
                  onSendCode={handleSendVerification}
                  onVerify={handleVerifyEmail}
                />
              }
              canEditBranding={currentUser?.role === "pimpinan"}
              profile={profile}
              setProfile={setProfile}
              uploadLogo={uploadLogo}
              onUploadFavicon={handleFaviconUpload}
              onRemoveFavicon={handleFaviconRemove}
              faviconBusy={faviconBusy}
              onSaveTheme={handleThemeSave}
              themeBusy={themeBusy}
              onSave={handleProfileSave}
              profileBusy={profileBusy}
              logoBusy={logoBusy}
            />
          )}
          {effectivePage === "akun" && (
            <AccountPage
              key={currentUser.id}
              account={accountQuery.data}
              fallback={currentUser}
              loading={accountQuery.isLoading}
              busy={accountBusy}
              error={accountError}
              passwordError={passwordError}
              passwordNotice={passwordNotice}
              onSave={handleAccountSave}
              onChangePassword={handlePasswordSave}
              onLogout={handleLogout}
              onUploadPhoto={handlePhotoUpload}
              onRemovePhoto={handlePhotoRemove}
              photoBusy={photoBusy}
              photoError={photoError}
              onClearCache={handleClearCache}
              cacheBusy={cacheBusy}
            />
          )}
        </section>
        <footer className="footer">
          <span>
            © 2026 {profile.school} · Muhammad Syaiful
          </span>
          <span>
            <ShieldCheck size={13} /> Data tersimpan dengan aman
          </span>
        </footer>
      </main>

      {mobileNav && <SidebarScrim setMobileNav={setMobileNav} />}
      {modal === "payment" && selected && (
        <PaymentModal
          modal={modal}
          setModal={setModal}
          selected={selected}
          payKind={payKind}
          setPayKind={setPayKind}
          payMonths={payMonths}
          paidMonths={paidMonths}
          setPayMonths={setPayMonths}
          payAmount={payAmount}
          setPayAmount={setPayAmount}
          setPayCost={setPayCost}
          positionRates={positionRates}
          sppAmountsByMonth={sppAmountsByMonth}
          activeCost={activeCost}
          selectedCost={selectedCost}
          selectedSppAmount={selectedSppAmount}
          remainingCost={remainingCost}
          paymentBillsLoading={paymentBillsQuery.isLoading}
          paymentBillsError={paymentBillsQuery.isError}
          paymentBusy={paymentBusy}
          paymentError={paymentError}
          savePayment={savePayment}
        />
      )}
      {modal === "student" && (
        <StudentModal
          modal={modal}
          setModal={setModal}
          classLevels={classLevels}
          addStudent={addStudent}
          busy={studentBusy}
        />
      )}
      {modal === "receipt" && receiptTransaction && (
        <ReceiptModal
          modal={modal}
          setModal={setModal}
          profile={profile}
          receiptTransaction={receiptTransaction}
          receiptStudent={students.find(
            (student) => student.name === receiptTransaction.student,
          )}
          receiptClassName={receiptTransaction.className}
          currentUser={currentUser}
        />
      )}
      {editTransaction && editPaymentContext && (
        <PaymentEditModal
          transaction={editTransaction}
          context={editPaymentContext}
          busy={editPaymentBusy}
          error={editPaymentError}
          onSave={(input) => void saveEditPayment(input)}
          onClose={() => {
            setEditTransaction(null);
            setEditPaymentError("");
          }}
        />
      )}
      {idleWarningMs !== null && (
            <div className="session-warning" role="alert">
              <Clock size={15} />
              <span>
                Sesi berakhir dalam{" "}
                <strong>{Math.max(1, Math.ceil(idleWarningMs / 60_000))} menit</strong>{" "}
                karena tidak ada aktivitas.
              </span>
              <button type="button" onClick={keepAlive}>
                Tetap masuk
              </button>
            </div>
          )}
          {toast && <Toast toast={toast} />}
    </div>
  );
}

export default App;
