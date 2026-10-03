import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ClipboardList,
  Clock,
  Download,
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
  changePassword,
  clearSession,
  createAcademicYear,
  createTreasurer,
  deleteSchoolFavicon,
  fetchAcademicYears,
  fetchAccount,
  fetchActivityLogs,
  fetchPortalData,
  fetchPublicSchoolProfile,
  fetchTreasurers,
  isHexColor,
  isNetworkFailure,
  login as loginApi,
  logout as logoutApi,
  normalizeHex,
  publicStorageUrl,
  readToken,
  saveSchoolTheme,
  setTreasurerActive,
  storeSession,
  resetTreasurerPassword,
  updateAccount,
  updateTreasurer,
  uploadSchoolFavicon,
  validateFaviconFile,
  validationMessage,
  type AuthUser,
  type Treasurer,
  createPosition,
  deleteProfilePhoto,
  fetchPositionRates,
  fetchSppPeriods,
  forgotPassword,
  resetPassword,
  savePositionRates,
  saveSppRates,
  sendVerificationCode,
  uploadProfilePhoto,
  validatePhotoFile,
  verifyEmailCode,
} from "./api";
import "./login.css";
import type { Notice, Page, Student, Transaction } from "./types";
import {
  initialSppRates,
  initialStudents,
  initialTransactions,
  monthNames,
} from "./constants";
import { formatToday } from "./lib/format";
import { studentSppAmount } from "./lib/students";
import { readLocal, readProfile, readSessionUser, writeLocal } from "./lib/storage";
import { applyFavicon, faviconErrorMessage } from "./lib/favicon";
import { buildNotices } from "./lib/notices";
import LoadingScreen from "./components/LoadingScreen";
import LoginPage from "./components/LoginPage";
import Dashboard from "./components/Dashboard";
import StudentsPage from "./components/StudentsPage";
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
import AccountPage from "./components/AccountPage";
import type { TreasurerForm } from "./components/BendaharaPage";
import ProfilePage from "./components/ProfilePage";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import SidebarScrim from "./components/SidebarScrim";
import PaymentModal from "./components/PaymentModal";
import StudentModal from "./components/StudentModal";
import ReceiptModal from "./components/ReceiptModal";
import Toast from "./components/Toast";


function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(readSessionUser);
  const [authError, setAuthError] = useState("");
  // Login and password recovery are two screens of the same signed-out flow.
  const [authMode, setAuthMode] = useState<"login" | "forgot">("login");
  const [recoverNotice, setRecoverNotice] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [students, setStudents] = useState(() =>
    readLocal("cendekia-students", initialStudents),
  );
  const [transactions, setTransactions] = useState(() =>
    readLocal("cendekia-transactions", initialTransactions),
  );
  const [profile, setProfile] = useState(readProfile);
  const [usePublicBranding] = useState(
    () => localStorage.getItem("cendekia-profile") === null,
  );
  const [sppAmounts, setSppAmounts] = useState<number[]>(() =>
    readLocal("cendekia-spp-amounts", initialSppRates),
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Student | null>(null);
  const [modal, setModal] = useState<"payment" | "student" | "receipt" | null>(
    null,
  );
  const [payKind, setPayKind] = useState<"spp" | "non-spp">("spp");
  const [payMonths, setPayMonths] = useState<number[]>([]);
  const [payCost, setPayCost] = useState("");
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [reportClass, setReportClass] = useState("Semua kelas");
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
  const [receiptTransaction, setReceiptTransaction] =
    useState<Transaction | null>(null);
  const [faviconBusy, setFaviconBusy] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
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
  // Declared ahead of the data queries below: `emailVerified` gates which of
  // them may run, and a query referencing it earlier would hit the temporal
  // dead zone during the first render.
  const accountQuery = useQuery({
    queryKey: ["account"],
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

  const schoolProfileQuery = useQuery({
    queryKey: ["public-school-profile"],
    queryFn: fetchPublicSchoolProfile,
  });
  const portalQuery = useQuery({
    queryKey: ["portal-data", selectedYearId],
    queryFn: () => fetchPortalData(selectedYearId),
    // Gated on the verification state, not just on being signed in. An
    // unverified account receives 403 for this endpoint, so firing it only
    // produced a guaranteed error that lingered in the cache and made the next
    // refetch look like a failure.
    enabled: Boolean(currentUser) && emailVerified,
  });
  const academicYearsQuery = useQuery({
    queryKey: ["academic-years"],
    queryFn: fetchAcademicYears,
    enabled: Boolean(currentUser),
  });
  const academicYears = academicYearsQuery.data ?? [];
  // Treasurer management is leadership-only; an admin hitting this gets a 403,
  // so the query stays disabled for them rather than firing a doomed request.
  const treasurersQuery = useQuery({
    queryKey: ["treasurers"],
    queryFn: fetchTreasurers,
    enabled: Boolean(currentUser) && currentUser?.role === "pimpinan",
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
      Boolean(currentUser) && emailVerified && currentUser?.role === "pimpinan",
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

  // Tariff reads are leadership-only; an admin would only ever get a 403.
  const sppPeriodsQuery = useQuery({
    queryKey: ["spp-periods", selectedYearId],
    queryFn: () => fetchSppPeriods(selectedYearId),
    enabled: Boolean(currentUser) && currentUser?.role === "pimpinan",
  });
  const positionRatesQuery = useQuery({
    queryKey: ["position-rates", selectedYearId],
    queryFn: fetchPositionRates,
    enabled: Boolean(currentUser) && currentUser?.role === "pimpinan",
  });

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
    if (selectedYearId === null) {
      setTariffError("Pilih tahun ajaran terlebih dahulu.");
      return;
    }
    void runTariffAction(async () => {
      await saveSppRates(
        selectedYearId,
        sppRows.map((row) => ({
          class_level_id: row.classLevelId,
          monthly_amount: row.amount,
        })),
      );
      return "Tarif SPP berhasil disimpan.";
    });
  };

  const saveCosts = () => {
    if (selectedYearId === null || effectiveCostClassId === null) {
      setTariffError("Pilih tahun ajaran dan tingkat kelas terlebih dahulu.");
      return;
    }
    void runTariffAction(async () => {
      await savePositionRates({
        academic_year_id: selectedYearId,
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
    if (selectedYearId === null || effectiveCostClassId === null) return;
    // Flip locally first so the switch responds immediately, then persist.
    setCostToggles((current) => ({ ...current, [row.paymentPositionId]: next }));
    void runTariffAction(async () => {
      await savePositionRates({
        academic_year_id: selectedYearId,
        class_level_id: effectiveCostClassId,
        positions: [
          { payment_position_id: row.paymentPositionId, amount: row.amount, is_active: next },
        ],
      });
      return next ? `${row.name} diaktifkan.` : `${row.name} dinonaktifkan.`;
    });
  };

  const addPosition = (input: { name: string; type: string; amount: number }) => {
    if (selectedYearId === null) return;
    void runTariffAction(async () => {
      const created = await createPosition({ ...input, academic_year_id: selectedYearId });
      return `Pos biaya ${created.name} berhasil ditambahkan.`;
    });
  };
  const [page, setPage] = useState<Page>("dashboard");

  /**
   * The address typed into the verification card. Kept as a draft so a reload or
   * a failed save never silently reverts what the user entered.
   */
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const storedEmail = accountQuery.data?.email ?? currentUser?.email ?? "";
  const emailDirty = emailDraft !== null && emailDraft !== storedEmail;

  // Derived, not synchronised: an unverified account always renders the profile
  // screen. `effectivePage` is what the renderer uses, so no effect is needed.
  const effectivePage: Page = emailVerified ? page : "profil";
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
    if (rates.length === 0) return [];
    const firstLevel = levels[0]?.id;
    const seen = new Map<string, { name: string; type: string; amount: number }>();
    for (const rate of rates) {
      if (firstLevel && rate.class_level_id !== firstLevel) continue;
      if (seen.has(rate.position)) continue;
      seen.set(rate.position, {
        name: rate.position,
        type:
          rate.type === "tahunan"
            ? "Tahunan"
            : rate.type === "cicilan"
              ? "Cicilan"
              : "Sekali bayar",
        amount: rate.amount,
      });
    }
    return [...seen.values()];
  }, [portalQuery.data]);
  const notices = useMemo(
    () => buildNotices(students, transactions, sppAmounts, classLevels),
    [students, transactions, sppAmounts, classLevels],
  );
  const unreadCount = notices.filter(
    (item) => !readNotices.includes(item.id),
  ).length;

  useEffect(() => {
    localStorage.setItem("cendekia-students", JSON.stringify(students));
  }, [students]);
  useEffect(() => {
    localStorage.setItem("cendekia-transactions", JSON.stringify(transactions));
  }, [transactions]);
  useEffect(() => {
    localStorage.setItem("cendekia-profile", JSON.stringify(profile));
  }, [profile]);
  useEffect(() => {
    localStorage.setItem("cendekia-spp-amounts", JSON.stringify(sppAmounts));
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
        })),
      );
      setTransactions(
        portal.transactions.map((transaction) => ({
          id: transaction.number,
          student: transaction.student,
          detail: transaction.detail,
          date: transaction.date,
          amount: transaction.amount,
          status: transaction.status,
        })),
      );
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
  // The stored cost name may no longer exist once positions load, so resolve it
  // to a valid entry during render rather than syncing it in an effect.
  const activeCost =
    positionRates.find((cost) => cost.name === payCost) ?? positionRates[0];
  useEffect(() => {
    const publicProfile = schoolProfileQuery.data;
    if (!publicProfile || !usePublicBranding) return;
    startTransition(() => {
      setProfile((current) => ({
        ...current,
        school: publicProfile.school_name || current.school,
        address: publicProfile.address || current.address,
        phone: publicProfile.phone || current.phone,
        email: publicProfile.email || current.email,
        themePrimary: publicProfile.theme_primary || current.themePrimary,
        themeAccent: publicProfile.theme_accent || current.themeAccent,
        logo: publicProfile.logo_path
          ? publicStorageUrl(publicProfile.logo_path)
          : current.logo,
        favicon: current.favicon,
      }));
    });
  }, [schoolProfileQuery.data, usePublicBranding]);
  useEffect(() => {
    applyTheme(effectiveTheme.primary, effectiveTheme.accent);
  }, [effectiveTheme.primary, effectiveTheme.accent]);
  useEffect(() => {
    const remoteFavicon = schoolProfileQuery.data?.favicon_path;
    if (!remoteFavicon) return;
    startTransition(() => {
      setProfile((current) =>
        current.favicon === publicStorageUrl(remoteFavicon)
          ? current
          : { ...current, favicon: publicStorageUrl(remoteFavicon) },
      );
    });
  }, [schoolProfileQuery.data?.favicon_path]);
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
    localStorage.setItem("cendekia-read-notices", JSON.stringify(readNotices));
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
    akun: "Akun saya",
  };
  const navGroups = emailVerified
    ? [
        {
          label: "MENU UTAMA",
          links: [
            { id: "dashboard" as Page, text: "Ringkasan", icon: LayoutDashboard },
            ...(currentUser?.role === "admin"
              ? [
                  { id: "siswa" as Page, text: "Data siswa", icon: Users },
                  { id: "pembayaran" as Page, text: "Pembayaran", icon: HandCoins },
                ]
              : []),
            { id: "laporan" as Page, text: "Laporan", icon: ClipboardList },
          ],
        },
        ...(currentUser?.role === "pimpinan"
          ? [
              {
                label: "PREFERENSI",
                links: [
                  {
                    id: "pengaturan" as Page,
                    text: "Pengaturan tarif",
                    icon: SlidersHorizontal,
                  },
                  { id: "profil" as Page, text: "Profil sekolah", icon: Building2 },
                  { id: "bendahara" as Page, text: "Kelola bendahara", icon: Wallet },
                  { id: "log" as Page, text: "Log aktivitas", icon: History },
                ],
              },
            ]
          : []),
        { label: "AKUN", links: [{ id: "akun" as Page, text: "Akun saya", icon: UserCog }] },
      ]
    // Unverified accounts see only the screen where they can verify.
    : [
        {
          label: "VERIFIKASI",
          links: [{ id: "profil" as Page, text: "Verifikasi email", icon: UserCog }],
        },
      ];
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
  const outstanding = students.reduce(
    (sum, student) =>
      sum + Math.max(0, 12 - student.paid.length) * studentSppAmount(student, sppAmounts, classLevels),
    0,
  );
  const monthlyRevenue = portalQuery.data?.summary.monthly_revenue ?? [];
  const selectedSppAmount = selected
    ? studentSppAmount(selected, sppAmounts, classLevels)
    : 0;
  const selectedCost = activeCost;
  const previousCostPayments = selected
    ? transactions
        .filter(
          (item) => item.student === selected.name && item.detail === payCost,
        )
        .reduce((sum, item) => sum + item.amount, 0)
    : 0;
  const remainingCost = Math.max(
    0,
    (selectedCost?.amount ?? 0) - previousCostPayments,
  );

  function openPayment(student: Student, kind: "spp" | "non-spp" = "spp") {
    setSelected(student);
    setPayKind(kind);
    setPayMonths([]);
    setPayAmount(positionRates[0]?.amount ?? 0);
    setModal("payment");
  }
  function savePayment() {
    if (!selected) return;
    const student = students.find((item) => item.id === selected.id);
    if (!student) return;
    const selectedCost = activeCost;
    const previousCostPayments = transactions
      .filter(
        (item) => item.student === student.name && item.detail === payCost,
      )
      .reduce((sum, item) => sum + item.amount, 0);
    const remainingCost = Math.max(
      0,
      (selectedCost?.amount ?? 0) - previousCostPayments,
    );
    const amount =
      payKind === "spp"
        ? payMonths.length * studentSppAmount(student, sppAmounts, classLevels)
        : payAmount;
    if (amount <= 0 || (payKind === "spp" && payMonths.length === 0)) {
      setToast("Pilih tagihan yang akan dibayar terlebih dahulu.");
      return;
    }
    if (
      payKind === "non-spp" &&
      (amount > remainingCost ||
        (selectedCost?.type !== "Cicilan" && amount !== remainingCost))
    ) {
      setToast("Jumlah pembayaran tidak sesuai dengan sisa tagihan.");
      return;
    }
    const id = `${payKind === "spp" ? "SPP" : "NSP"}-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${String(transactions.length + 83).padStart(4, "0")}`;
    const detail =
      payKind === "spp"
        ? `SPP · ${payMonths.map((month) => monthNames[month]).join(", ")}`
        : activeCost?.name ?? "";
    const transaction = {
      id,
      student: student.name,
      detail,
      date: "Hari ini, sekarang",
      amount,
      status: "Lunas",
    };
    setTransactions((items) => [transaction, ...items]);
    if (payKind === "spp") {
      setStudents((items) =>
        items.map((item) =>
          item.id === student.id
            ? {
                ...item,
                paid: [...new Set([...item.paid, ...payMonths])].sort(
                  (a, b) => a - b,
                ),
              }
            : item,
        ),
      );
    }
    setReceiptTransaction(transaction);
    setModal("receipt");
    setToast("Pembayaran berhasil disimpan.");
  }
  async function exportReport(
    format: "csv" | "pdf",
    reportTransactions: Transaction[] = transactions,
    classFilter = "Semua kelas",
  ) {
    if (format === "pdf") {
      setPdfLoading(true);
      try {
        const { downloadPaymentReport } = await import("./reportPdf");
        await downloadPaymentReport({
          school: profile,
          user: currentUser ?? { name: "Petugas Keuangan", role: "admin" },
          transactions: reportTransactions,
          students,
          classFilter,
        });
        setToast("Laporan PDF berhasil diunduh.");
      } catch {
        setToast("PDF gagal dibuat. Coba periksa kembali data laporan.");
      } finally {
        setPdfLoading(false);
      }
      return;
    }

    const rows = [
      ["No. Transaksi", "Nama siswa", "Rincian", "Tanggal", "Jumlah", "Status"],
      ...reportTransactions.map((item) => [
        item.id,
        item.student,
        item.detail,
        item.date,
        String(item.amount),
        item.status,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    link.download = "laporan-pembayaran-sekolah.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    setToast("Laporan berhasil diekspor.");
  }
  function addStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const student = {
      id: String(form.get("id")),
      name: String(form.get("name")),
      className: String(form.get("className")),
      nisn: String(form.get("nisn")),
      paid: [],
    };
    setStudents((items) => [student, ...items]);
    setModal(null);
    setToast("Data siswa berhasil ditambahkan.");
  }
  function uploadLogo(file?: File) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setToast("Gunakan PNG, JPG, atau WebP maksimal 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setProfile((value) => ({ ...value, logo: String(reader.result) }));
    reader.readAsDataURL(file);
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
      setProfile((value) => ({
        ...value,
        themePrimary: profile.themePrimary,
        themeAccent: profile.themeAccent,
      }));
      setToast(faviconErrorMessage(error));
    } finally {
      setThemeBusy(false);
    }
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
    clearSession();
    setCurrentUser(null);
    setPage("dashboard");
    setActiveTab("spp");
  }

  /** Drop the session without a round trip, used when it expires. */
  function handleSessionExpired() {
    clearSessionActivity();
    clearSession();
    setCurrentUser(null);
    setPage("dashboard");
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
      setVerifyError(
        validationMessage(error, "code") ?? "Kode verifikasi ditolak. Coba lagi.",
      );
    } finally {
      setVerifyBusy(false);
    }
  }

  async function handleAccountSave(name: string, username: string, email: string) {
    if (accountBusy) return;
    setAccountBusy(true);
    setAccountError("");
    try {
      const updated = await updateAccount({ name, username, email });
      storeSession(readToken() ?? "", updated);
      setCurrentUser(updated);
      setToast("Data akun berhasil diperbarui.");
      await queryClient.invalidateQueries({ queryKey: ["account"] });
    } catch (error) {
      setAccountError(
        validationMessage(error, "username") ??
          validationMessage(error, "email") ??
          validationMessage(error, "name") ??
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
   * The full-screen splash is reserved for signing in.
   *
   * It used to also cover `schoolProfileQuery` and `portalQuery`, but those are
   * pending on every cold start — reopening a tab, reloading, restarting the app —
   * so a routine refresh replaced the whole interface with a splash screen. The
   * data they fetch is already mirrored into localStorage and used as the
   * initial state above, so there is always something real to render: the last
   * known numbers appear immediately and are corrected once the response lands.
   *
   * Signing in is different. There is nothing to show beforehand, and dropping
   * the pending state there would leave the button looking dead while the
   * server is being contacted.
   */
  if (authLoading) {
    return (
      <LoadingScreen
        school={profile.school}
        logo={profile.logo}
        message="Memverifikasi akun"
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
          onBackToLogin={() => {
            setAuthMode("login");
            setAuthError("");
            setRecoverNotice("");
          }}
          onRequestCode={async (identifier) => {
            setAuthError("");
            try {
              await forgotPassword(identifier);
              setRecoverNotice(
                "Jika data tersebut terdaftar, kode atur ulang sudah dikirim ke email akun.",
              );
            } catch (error) {
              setAuthError(
                validationMessage(error, "identifier") ??
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
              setAuthMode("login");
            } catch (error) {
              setAuthError(
                validationMessage(error, "token") ??
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
            // Opening the idle window here means the countdown starts at login,
            // not at whatever timestamp a previous visit left behind.
            startSession();
            setCurrentUser(session.user);
            setPage("dashboard");
          } catch (error) {
            // A dead/unreachable backend looks identical to a bad password unless
            // we separate the two, which previously sent people hunting for a typo.
            setAuthError(
              isNetworkFailure(error)
                ? "Server tidak dapat dihubungi. Pastikan backend berjalan, lalu coba lagi."
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
        selectedYearId={selectedYearId}
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
                  ? `Assalamu'alaikum, ${currentUser.name.split(" ")[0]}`
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
                              : "Pantau realisasi penerimaan dan tunggakan sekolah."}
              </p>
            </div>
            {effectivePage === "dashboard" && (
              <button
                className="button button-outline"
                onClick={() => void exportReport("pdf", transactions)}
              >
                <Download size={16} /> Unduh PDF
              </button>
            )}
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
              selectedYearId={selectedYearId}
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
              students={filteredStudents}
              sppAmounts={sppAmounts}
              classLevels={classLevels}
              search={search}
              setSearch={setSearch}
              onPay={openPayment}
              onAdd={() => setModal("student")}
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
            />
          )}
          {effectivePage === "laporan" && (
            <ReportsPage
              transactions={transactions}
              students={students}
              classLevels={classLevels}
              reportClass={reportClass}
              setReportClass={setReportClass}
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
              profile={profile}
              setProfile={setProfile}
              uploadLogo={uploadLogo}
              onUploadFavicon={handleFaviconUpload}
              onRemoveFavicon={handleFaviconRemove}
              faviconBusy={faviconBusy}
              onSaveTheme={handleThemeSave}
              themeBusy={themeBusy}
              onSave={() => setToast("Profil sekolah berhasil disimpan.")}
            />
          )}
          {effectivePage === "akun" && (
            <AccountPage
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
            />
          )}
        </section>
        <footer className="footer">
          <span>© 2026 {profile.school}</span>
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
          setPayMonths={setPayMonths}
          payAmount={payAmount}
          setPayAmount={setPayAmount}
          setPayCost={setPayCost}
          positionRates={positionRates}
          activeCost={activeCost}
          selectedCost={selectedCost}
          selectedSppAmount={selectedSppAmount}
          remainingCost={remainingCost}
          savePayment={savePayment}
        />
      )}
      {modal === "student" && (
        <StudentModal
          modal={modal}
          setModal={setModal}
          classLevels={classLevels}
          addStudent={addStudent}
        />
      )}
      {modal === "receipt" && receiptTransaction && (
        <ReceiptModal
          modal={modal}
          setModal={setModal}
          profile={profile}
          receiptTransaction={receiptTransaction}
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
