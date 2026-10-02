import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ClipboardList,
  Download,
  HandCoins,
  LayoutDashboard,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
} from "lucide-react";
import {
  applyTheme,
  changePassword,
  clearSession,
  deleteSchoolFavicon,
  fetchAccount,
  fetchPortalData,
  fetchPublicSchoolProfile,
  isHexColor,
  isNetworkFailure,
  login as loginApi,
  logout as logoutApi,
  normalizeHex,
  publicStorageUrl,
  readToken,
  saveSchoolTheme,
  storeSession,
  updateAccount,
  uploadSchoolFavicon,
  validateFaviconFile,
  validationMessage,
  type AuthUser,
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
import { readLocal, readProfile, readSessionUser } from "./lib/storage";
import { applyFavicon, faviconErrorMessage } from "./lib/favicon";
import { buildNotices } from "./lib/notices";
import LoadingScreen from "./components/LoadingScreen";
import LoginPage from "./components/LoginPage";
import Dashboard from "./components/Dashboard";
import StudentsPage from "./components/StudentsPage";
import PaymentPage from "./components/PaymentPage";
import ReportsPage from "./components/ReportsPage";
import SettingsPage from "./components/SettingsPage";
import AccountPage from "./components/AccountPage";
import ProfilePage from "./components/ProfilePage";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import SidebarScrim from "./components/SidebarScrim";
import PaymentModal from "./components/PaymentModal";
import StudentModal from "./components/StudentModal";
import ReceiptModal from "./components/ReceiptModal";
import Toast from "./components/Toast";

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(readSessionUser);
  const [authError, setAuthError] = useState("");
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
  const [activeTab, setActiveTab] = useState<"spp" | "biaya">("spp");
  const [payAmount, setPayAmount] = useState(0);
  const [receiptTransaction, setReceiptTransaction] =
    useState<Transaction | null>(null);
  const [faviconBusy, setFaviconBusy] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [academicYear, setAcademicYear] = useState("2026 / 2027");
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [readNotices, setReadNotices] = useState<string[]>(() =>
    readLocal("cendekia-read-notices", [] as string[]),
  );
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const today = formatToday(now);
  const queryClient = useQueryClient();
  const schoolProfileQuery = useQuery({
    queryKey: ["public-school-profile"],
    queryFn: fetchPublicSchoolProfile,
  });
  const portalQuery = useQuery({
    queryKey: ["portal-data"],
    queryFn: fetchPortalData,
    enabled: Boolean(currentUser),
  });
  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: fetchAccount,
    enabled: Boolean(currentUser),
  });
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
      }
    });
  }, [portalQuery.data]);
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

  const pageTitles: Record<Page, string> = {
    dashboard: "Ringkasan",
    siswa: "Data siswa",
    pembayaran: "Pembayaran",
    laporan: "Laporan",
    pengaturan: "Pengaturan tarif",
    profil: "Profil sekolah",
    akun: "Akun saya",
  };
  const navGroups = [
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
            ],
          },
        ]
      : []),
    {
      label: "AKUN",
      links: [{ id: "akun" as Page, text: "Akun saya", icon: UserCog }],
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
    try {
      await logoutApi();
    } catch {
      clearSession();
    }
    setCurrentUser(null);
    setPage("dashboard");
  }

  async function handleAccountSave(name: string, email: string) {
    if (accountBusy) return;
    setAccountBusy(true);
    setAccountError("");
    try {
      const updated = await updateAccount({ name, email });
      storeSession(readToken() ?? "", updated);
      setCurrentUser(updated);
      setToast("Data akun berhasil diperbarui.");
      await queryClient.invalidateQueries({ queryKey: ["account"] });
    } catch (error) {
      setAccountError(
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

  if (
    schoolProfileQuery.isLoading ||
    portalQuery.isLoading ||
    authLoading ||
    pdfLoading
  ) {
    return (
      <LoadingScreen
        school={profile.school}
        logo={profile.logo}
        message={
          pdfLoading
            ? "Menyusun laporan PDF"
            : authLoading
              ? "Memverifikasi akun"
              : portalQuery.isLoading
                ? "Mengambil data dari database"
                : "Menyiapkan portal sekolah"
        }
      />
    );
  }

  if (!currentUser) {
    return (
      <LoginPage
        school={profile.school}
        logo={profile.logo}
        error={authError}
        onSubmit={async (username, password) => {
          setAuthError("");
          setAuthLoading(true);
          try {
            const session = await loginApi(username, password);
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
        academicYear={academicYear}
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
                {page === "dashboard"
                  ? `Assalamu'alaikum, ${currentUser.name.split(" ")[0]}`
                  : pageTitles[page]}
              </h1>
              <p>
                {page === "dashboard"
                  ? "Berikut ringkasan keuangan sekolah hari ini."
                  : page === "pembayaran"
                    ? "Kelola pembayaran SPP dan biaya pendidikan siswa."
                    : page === "siswa"
                      ? "Kelola data siswa dan pantau status pembayaran."
                      : page === "pengaturan"
                        ? "Atur tarif SPP dan pos biaya sesuai kebijakan sekolah."
                        : page === "profil"
                          ? "Identitas sekolah yang tampil di kuitansi dan laporan."
                          : "Pantau realisasi penerimaan dan tunggakan sekolah."}
              </p>
            </div>
            {page === "dashboard" && (
              <button
                className="button button-outline"
                onClick={() => void exportReport("pdf", transactions)}
              >
                <Download size={16} /> Unduh PDF
              </button>
            )}
            {page === "siswa" && (
              <button
                className="button button-primary"
                onClick={() => setModal("student")}
              >
                <Plus size={17} /> Tambah siswa
              </button>
            )}
          </div>

          {page === "dashboard" && (
            <Dashboard
              students={students}
              transactions={transactions}
              totalPaid={totalPaid}
              outstanding={outstanding}
              monthlyRevenue={monthlyRevenue}
              onGo={setPage}
              onReceipt={(item) => {
                setReceiptTransaction(item);
                setModal("receipt");
              }}
            />
          )}
          {page === "siswa" && (
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
          {page === "pembayaran" && (
            <PaymentPage
              students={filteredStudents}
              sppAmounts={sppAmounts}
              classLevels={classLevels}
              search={search}
              setSearch={setSearch}
              onPay={openPayment}
            />
          )}
          {page === "laporan" && (
            <ReportsPage
              transactions={transactions}
              students={students}
              classLevels={classLevels}
              reportClass={reportClass}
              setReportClass={setReportClass}
              onExport={exportReport}
            />
          )}
          {page === "pengaturan" && (
            <SettingsPage
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              sppAmounts={sppAmounts}
              setSppAmounts={setSppAmounts}
              costs={positionRates}
            />
          )}
          {page === "profil" && (
            <ProfilePage
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
          {page === "akun" && (
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
      {toast && <Toast toast={toast} />}
    </div>
  );
}

export default App;
