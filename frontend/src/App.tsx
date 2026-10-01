import axios from "axios";
import { startTransition, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteSchoolFavicon,
  fetchPublicSchoolProfile,
  login as loginApi,
  logout as logoutApi,
  publicStorageUrl,
  uploadSchoolFavicon,
  validateFaviconFile,
  type AuthUser,
} from "./api";
import "./login.css";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Bell,
  BookOpenCheck,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Download,
  FileSpreadsheet,
  GraduationCap,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash,
  Upload,
  Users,
  Wallet,
  Eye,
  EyeOff,
  X,
} from "lucide-react";

type Page =
  "dashboard" | "siswa" | "pembayaran" | "laporan" | "pengaturan" | "profil";
type Student = {
  id: string;
  name: string;
  className: string;
  paid: number[];
  nisn: string;
};
type Transaction = {
  id: string;
  student: string;
  detail: string;
  date: string;
  amount: number;
  status: string;
};
type Profile = {
  school: string;
  foundation: string;
  address: string;
  phone: string;
  email: string;
  note: string;
  logo: string;
  favicon: string;
};

const months = [
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
];
const monthNames = [
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
];
const classLevels = [
  "Kelas I",
  "Kelas II",
  "Kelas III",
  "Kelas IV",
  "Kelas V",
  "Kelas VI",
];
const initialStudents: Student[] = [
  {
    id: "2401001",
    name: "Alya Putri Ramadhani",
    className: "Kelas I",
    paid: [0, 1, 2, 3, 4, 5, 6, 7],
    nisn: "0128456731",
  },
  {
    id: "2401002",
    name: "Bima Aditya Pratama",
    className: "Kelas I",
    paid: [0, 1, 2, 3, 4, 5, 6],
    nisn: "0128456732",
  },
  {
    id: "2302041",
    name: "Citra Maharani",
    className: "Kelas II",
    paid: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    nisn: "0117345610",
  },
  {
    id: "2203018",
    name: "Daffa Alfarizi",
    className: "Kelas III",
    paid: [0, 1, 2, 3, 4, 5],
    nisn: "0106234581",
  },
  {
    id: "2104029",
    name: "Elara Safitri",
    className: "Kelas IV",
    paid: [0, 1, 2, 3, 4, 5, 6, 7],
    nisn: "0095123472",
  },
  {
    id: "2005012",
    name: "Faris Alghifari",
    className: "Kelas V",
    paid: [0, 1, 2, 3, 4, 5, 6],
    nisn: "0084012363",
  },
  {
    id: "1906033",
    name: "Gita Nadhira",
    className: "Kelas VI",
    paid: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    nisn: "0073901254",
  },
];
const initialTransactions: Transaction[] = [
  {
    id: "SPP-261001-0082",
    student: "Alya Putri Ramadhani",
    detail: "SPP · Februari 2026",
    date: "Hari ini, 09.42",
    amount: 350000,
    status: "Lunas",
  },
  {
    id: "SPP-261001-0081",
    student: "Citra Maharani",
    detail: "SPP · Maret 2026",
    date: "Hari ini, 09.18",
    amount: 350000,
    status: "Lunas",
  },
  {
    id: "NSP-260930-0080",
    student: "Gita Nadhira",
    detail: "Uang kegiatan",
    date: "30 Sep 2026, 14.05",
    amount: 250000,
    status: "Lunas",
  },
];
const initialProfile: Profile = {
  school: "SD Cendekia Bangsa",
  foundation: "Yayasan Cendekia Nusantara",
  address: "Jl. Melati No. 28, Bandung, Jawa Barat",
  phone: "(022) 7201 884",
  email: "info@cendekiabangsa.sch.id",
  note: "Terima kasih telah melakukan pembayaran tepat waktu.",
  logo: "",
  favicon: "",
};
const costs = [
  { name: "Uang Kegiatan", type: "Tahunan", amount: 250000 },
  { name: "Uang Pembangunan", type: "Cicilan", amount: 1500000 },
  { name: "Uang Perpisahan", type: "Sekali bayar", amount: 450000 },
  { name: "Seragam & perlengkapan", type: "Sekali bayar", amount: 600000 },
];
const revenue = [28, 42, 35, 52, 46, 69, 57, 78, 63, 84, 73, 96];

function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
function money(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
function studentSppAmount(student: Student, rates: number[]) {
  return rates[classLevels.indexOf(student.className)] ?? rates[0] ?? 0;
}
function readSessionUser(): AuthUser | null {
  if (!sessionStorage.getItem("cendekia-token")) return null;
  try {
    return JSON.parse(sessionStorage.getItem("cendekia-user") ?? "null") as AuthUser | null;
  } catch {
    return null;
  }
}

const defaultFavicon = "/favicon.svg";

function faviconMimeType(source: string): string {
  if (!source || source.startsWith("data:")) return "image/png";
  const extension = source.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() ?? "";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "ico") return "image/x-icon";
  return "image/png";
}

function faviconErrorMessage(error: unknown): string {
  const response = axios.isAxiosError(error) ? error.response : undefined;
  const validation = response?.data?.errors?.favicon;
  if (Array.isArray(validation) && validation.length > 0) {
    return String(validation[0]);
  }
  if (response?.status === 403) {
    return "Hanya pimpinan yang dapat mengubah favicon.";
  }
  if (response?.status === 401) {
    return "Sesi Anda berakhir. Silakan masuk kembali.";
  }
  if (error instanceof TypeError || !response) {
    return "Server branding tidak dapat dihubungi. Coba lagi beberapa saat.";
  }
  return "Favicon gagal disimpan. Silakan coba kembali.";
}

function applyFavicon(source: string) {
  const target = source || defaultFavicon;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = faviconMimeType(target);
  if (link.href !== new URL(target, window.location.origin).toString()) {
    link.href = target;
  }
  return target;
}
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
  const [profile, setProfile] = useState(() =>
    readLocal("cendekia-profile", initialProfile),
  );
  const [usePublicBranding] = useState(
    () => localStorage.getItem("cendekia-profile") === null,
  );
  const [sppAmounts, setSppAmounts] = useState(() =>
    readLocal(
      "cendekia-spp-amounts",
      [350000, 360000, 370000, 380000, 390000, 400000],
    ),
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Student | null>(null);
  const [modal, setModal] = useState<"payment" | "student" | "receipt" | null>(
    null,
  );
  const [payKind, setPayKind] = useState<"spp" | "non-spp">("spp");
  const [payMonths, setPayMonths] = useState<number[]>([]);
  const [payCost, setPayCost] = useState(costs[0].name);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [reportClass, setReportClass] = useState("Semua kelas");
  const [activeTab, setActiveTab] = useState<"spp" | "biaya">("spp");
  const [payAmount, setPayAmount] = useState(costs[0].amount);
  const [receiptTransaction, setReceiptTransaction] =
    useState<Transaction | null>(null);
  const [faviconBusy, setFaviconBusy] = useState(false);
  const queryClient = useQueryClient();
  const schoolProfileQuery = useQuery({
    queryKey: ["public-school-profile"],
    queryFn: fetchPublicSchoolProfile,
  });

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
    const publicProfile = schoolProfileQuery.data;
    if (!publicProfile || !usePublicBranding) return;
    startTransition(() => {
      setProfile((current) => ({
        ...current,
        school: publicProfile.school_name || current.school,
        address: publicProfile.address || current.address,
        phone: publicProfile.phone || current.phone,
        email: publicProfile.email || current.email,
        logo: publicProfile.logo_path
          ? publicStorageUrl(publicProfile.logo_path)
          : current.logo,
        favicon: current.favicon,
      }));
    });
  }, [schoolProfileQuery.data, usePublicBranding]);
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
    applyFavicon(profile.favicon);
  }, [profile.favicon]);
  useEffect(() => {
    if (toast) {
      const timer = window.setTimeout(() => setToast(""), 2600);
      return () => window.clearTimeout(timer);
    }
  }, [toast]);

  const pageTitles: Record<Page, string> = {
    dashboard: "Ringkasan",
    siswa: "Data siswa",
    pembayaran: "Pembayaran",
    laporan: "Laporan",
    pengaturan: "Pengaturan tarif",
    profil: "Profil sekolah",
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
  ];
  const filteredStudents = students.filter((student) =>
    `${student.name} ${student.id} ${student.nisn} ${student.className}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const totalPaid =
    students.reduce(
      (sum, student) =>
        sum + student.paid.length * studentSppAmount(student, sppAmounts),
      0,
    ) + 18450000;
  const outstanding = students.reduce(
    (sum, student) =>
      sum + (12 - student.paid.length) * studentSppAmount(student, sppAmounts),
    0,
  );
  const selectedSppAmount = selected
    ? studentSppAmount(selected, sppAmounts)
    : sppAmounts[0];
  const selectedCost = costs.find((cost) => cost.name === payCost);
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
    setPayAmount(costs[0].amount);
    setModal("payment");
  }
  function savePayment() {
    if (!selected) return;
    const student = students.find((item) => item.id === selected.id);
    if (!student) return;
    const selectedCost = costs.find((cost) => cost.name === payCost);
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
        ? payMonths.length * studentSppAmount(student, sppAmounts)
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
        : payCost;
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
  async function handleLogout() {
    try {
      await logoutApi();
    } catch {
      sessionStorage.removeItem("cendekia-token");
      sessionStorage.removeItem("cendekia-user");
    }
    setCurrentUser(null);
    setPage("dashboard");
  }

  if (schoolProfileQuery.isLoading || authLoading || pdfLoading) {
    return (
      <LoadingScreen
        school={profile.school}
        logo={profile.logo}
        message={
          pdfLoading
            ? "Menyusun laporan PDF"
            : authLoading
              ? "Memverifikasi akun"
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
          } catch {
            setAuthError("Username atau kata sandi tidak sesuai.");
          } finally {
            setAuthLoading(false);
          }
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            {profile.logo ? (
              <img src={profile.logo} alt="" />
            ) : (
              <GraduationCap size={21} />
            )}
          </div>
          <div>
            <strong>{profile.school}</strong>
            <span>PORTAL KEUANGAN</span>
          </div>
          <button
            className="icon-button sidebar-close"
            aria-label="Tutup menu"
            onClick={() => setMobileNav(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="school-switch">
          <div className="school-avatar">CB</div>
          <div>
            <span>UNIT SEKOLAH</span>
            <strong>SD · Tahun 2026/27</strong>
          </div>
          <ChevronDown size={15} />
        </div>
        <nav className="main-nav" aria-label="Navigasi utama">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.links.map(({ id, text, icon: Icon }) => (
                <button
                  key={id}
                  className={`nav-link ${page === id ? "active" : ""}`}
                  onClick={() => {
                    setPage(id);
                    setMobileNav(false);
                  }}
                >
                  <Icon size={18} strokeWidth={1.8} />
                  <span>{text}</span>
                  {id === "pembayaran" && <i className="nav-dot" />}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="term-card">
            <div className="term-icon">
              <Sparkles size={16} />
            </div>
            <div>
              <strong>Semester Ganjil</strong>
              <span>Juli – Desember 2026</span>
            </div>
            <ChevronRight size={15} />
          </div>
          <div className="user-profile">
            <div className="user-avatar">{currentUser.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
            <div>
              <strong>{currentUser.name}</strong>
              <span>{currentUser.role === "pimpinan" ? "Pimpinan" : "Admin Keuangan"}</span>
            </div>
            <button className="icon-button" title="Keluar" aria-label="Keluar" onClick={handleLogout}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Buka menu"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumbs">
            <span>Keuangan</span>
            <ChevronRight size={14} />
            <strong>{pageTitles[page]}</strong>
          </div>
          <div className="top-actions">
            <span className="academic-year">
              <CalendarDays size={15} /> 2026 / 2027 <ChevronDown size={14} />
            </span>
            <button
              className="icon-button notification-button"
              title="Notifikasi"
            >
              <Bell size={18} />
              <i />
            </button>
            <div className="top-avatar">{currentUser.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
          </div>
        </header>
        <section className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                RABU, 1 OKTOBER 2026 <span className="live-dot" /> DATA TERBARU
              </div>
              <h1>
                {page === "dashboard"
                  ? `Selamat pagi, ${currentUser.name.split(" ")[0]}`
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
              search={search}
              setSearch={setSearch}
              onPay={openPayment}
            />
          )}
          {page === "laporan" && (
            <ReportsPage
              transactions={transactions}
              students={students}
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
              onSave={() => setToast("Profil sekolah berhasil disimpan.")}
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

      {mobileNav && (
        <button
          className="sidebar-scrim"
          aria-label="Tutup navigasi"
          onClick={() => setMobileNav(false)}
        />
      )}
      {modal === "payment" && selected && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal payment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-title"
          >
            <div className="modal-head">
              <div>
                <div className="eyebrow">TRANSAKSI BARU</div>
                <h2 id="payment-title">Catat pembayaran</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Tutup"
                onClick={() => setModal(null)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="student-mini">
              <div className="student-avatar">
                {selected.name
                  .split(" ")
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")}
              </div>
              <div>
                <strong>{selected.name}</strong>
                <span>
                  {selected.id} <i /> {selected.className}
                </span>
              </div>
            </div>
            <div className="segmented">
              <button
                className={payKind === "spp" ? "selected" : ""}
                onClick={() => setPayKind("spp")}
              >
                SPP bulanan
              </button>
              <button
                className={payKind === "non-spp" ? "selected" : ""}
                onClick={() => setPayKind("non-spp")}
              >
                Biaya lainnya
              </button>
            </div>
            {payKind === "spp" ? (
              <>
                <div className="field-label-row">
                  <label>Pilih bulan yang akan dibayar</label>
                  <span>Tarif {money(selectedSppAmount)} / bulan</span>
                </div>
                <div className="month-grid">
                  {monthNames.map((month, index) => {
                    const isPaid = selected.paid.includes(index);
                    return (
                      <button
                        key={month}
                        disabled={isPaid}
                        className={`month-option ${isPaid ? "is-paid" : ""} ${payMonths.includes(index) ? "is-selected" : ""}`}
                        onClick={() =>
                          setPayMonths((items) =>
                            items.includes(index)
                              ? items.filter((item) => item !== index)
                              : [...items, index],
                          )
                        }
                      >
                        {isPaid ? <Check size={13} /> : null}
                        <span>{month}</span>
                        <small>{isPaid ? "Lunas" : "Belum bayar"}</small>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="form-field">
                <label htmlFor="pay-cost">Pilih pos biaya</label>
                <select
                  id="pay-cost"
                  value={payCost}
                  onChange={(event) => {
                    const cost = costs.find(
                      (item) => item.name === event.target.value,
                    );
                    setPayCost(event.target.value);
                    setPayAmount(cost?.amount ?? 0);
                  }}
                >
                  {costs.map((cost) => (
                    <option key={cost.name} value={cost.name}>
                      {cost.name} · {money(cost.amount)}
                    </option>
                  ))}
                </select>
                {selectedCost?.type === "Cicilan" && (
                  <>
                    <label htmlFor="pay-amount">Jumlah cicilan</label>
                    <input
                      id="pay-amount"
                      type="number"
                      min="1"
                      max={remainingCost}
                      step="10000"
                      value={Math.min(payAmount, remainingCost)}
                      onChange={(event) =>
                        setPayAmount(Number(event.target.value))
                      }
                    />
                  </>
                )}
                <small className="field-hint">
                  {selectedCost?.type === "Cicilan"
                    ? `Sisa tagihan ${money(remainingCost)}.`
                    : "Pembayaran dicatat sebagai pelunasan pos biaya terpilih."}
                </small>
              </div>
            )}
            <div className="payment-total">
              <span>Total pembayaran</span>
              <strong>
                {money(
                  payKind === "spp"
                    ? payMonths.length * selectedSppAmount
                    : Math.min(payAmount, remainingCost),
                )}
              </strong>
            </div>
            <div className="modal-actions">
              <button
                className="button button-outline"
                onClick={() => setModal(null)}
              >
                Batal
              </button>
              <button className="button button-primary" onClick={savePayment}>
                <Check size={16} /> Simpan pembayaran
              </button>
            </div>
          </section>
        </div>
      )}
      {modal === "student" && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModal(null);
          }}
        >
          <form className="modal" onSubmit={addStudent}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">DATA SISWA</div>
                <h2>Tambah siswa baru</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Tutup"
                onClick={() => setModal(null)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="new-id">NIS</label>
                <input
                  id="new-id"
                  name="id"
                  placeholder="Contoh: 2401008"
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="new-nisn">NISN</label>
                <input
                  id="new-nisn"
                  name="nisn"
                  placeholder="10 digit NISN"
                  required
                />
              </div>
              <div className="form-field full">
                <label htmlFor="new-name">Nama lengkap</label>
                <input
                  id="new-name"
                  name="name"
                  placeholder="Nama siswa"
                  required
                />
              </div>
              <div className="form-field full">
                <label htmlFor="new-class">Tingkat kelas</label>
                <select id="new-class" name="className">
                  {[
                    "Kelas I",
                    "Kelas II",
                    "Kelas III",
                    "Kelas IV",
                    "Kelas V",
                    "Kelas VI",
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-outline"
                onClick={() => setModal(null)}
              >
                Batal
              </button>
              <button className="button button-primary" type="submit">
                <Plus size={16} /> Simpan siswa
              </button>
            </div>
          </form>
        </div>
      )}
      {modal === "receipt" && receiptTransaction && (
        <div className="modal-backdrop receipt-backdrop">
          <section
            className="modal receipt-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-title"
          >
            <div className="modal-head no-print">
              <div>
                <div className="eyebrow">PEMBAYARAN BERHASIL</div>
                <h2 id="receipt-title">Kuitansi pembayaran</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Tutup"
                onClick={() => setModal(null)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="receipt-paper">
              <div className="receipt-brand">
                {profile.logo ? (
                  <img src={profile.logo} alt="Logo sekolah" />
                ) : (
                  <div className="receipt-logo">
                    <GraduationCap size={21} />
                  </div>
                )}
                <div>
                  <strong>{profile.school}</strong>
                  <span>{profile.address}</span>
                  <span>
                    {profile.phone} · {profile.email}
                  </span>
                </div>
              </div>
              <div className="receipt-divider" />
              <div className="receipt-title">
                <h3>BUKTI PEMBAYARAN</h3>
                <span>{receiptTransaction.id}</span>
              </div>
              <div className="receipt-line">
                <span>Nama siswa</span>
                <strong>{receiptTransaction.student}</strong>
              </div>
              <div className="receipt-line">
                <span>Rincian pembayaran</span>
                <strong>{receiptTransaction.detail}</strong>
              </div>
              <div className="receipt-line">
                <span>Tanggal transaksi</span>
                <strong>{receiptTransaction.date}</strong>
              </div>
              <div className="receipt-total">
                <span>Total dibayarkan</span>
                <strong>{money(receiptTransaction.amount)}</strong>
              </div>
              <p className="receipt-note">{profile.note}</p>
              <div className="receipt-signature">
                <span>Petugas penerima</span>
                <strong>Nadia Amalia</strong>
              </div>
            </div>
            <div className="modal-actions no-print">
              <button
                className="button button-outline"
                onClick={() => setModal(null)}
              >
                Tutup
              </button>
              <button
                className="button button-primary"
                onClick={() => window.print()}
              >
                <Printer size={16} /> Cetak kuitansi
              </button>
            </div>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast">
          <BadgeCheck size={17} /> {toast}
        </div>
      )}
    </div>
  );
}

function LoadingScreen({
  school,
  logo,
  message,
}: {
  school: string;
  logo: string;
  message: string;
}) {
  const initials = school
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

  return (
    <main className="loading-shell" role="status" aria-live="polite">
      <div className="loading-mark">
        {logo ? <img src={logo} alt="" /> : <span>{initials || "SD"}</span>}
      </div>
      <strong>{school}</strong>
      <span className="loading-caption">PORTAL KEUANGAN SEKOLAH</span>
      <div className="loading-spinner" aria-hidden="true" />
      <p>{message}</p>
      <div className="loading-track" aria-hidden="true"><i /></div>
    </main>
  );
}

function LoginPage({
  school,
  logo,
  error,
  onSubmit,
}: {
  school: string;
  logo: string;
  error: string;
  onSubmit: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(username, password);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-visual" aria-label={school}>
        <div className="login-visual-grid" />
        <div className="login-school-lockup">
          <div className="login-emblem">
            {logo ? <img src={logo} alt="" /> : <GraduationCap size={25} />}
          </div>
          <div>
            <strong>{school}</strong>
            <span>PORTAL KEUANGAN</span>
          </div>
        </div>
        <div className="login-visual-copy">
          <span className="login-kicker"><i /> AREA ADMINISTRASI SEKOLAH</span>
          <h1>Selamat datang<br />di portal <em>keuangan.</em></h1>
          <p>Ruang kerja keuangan sekolah untuk tahun ajaran 2026 / 2027.</p>
        </div>
        <div className="login-ledger" aria-hidden="true">
          <div className="ledger-heading"><span>RINGKASAN BULANAN</span><span>2026 — 2027</span></div>
          <div className="ledger-bars"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          <div className="ledger-months"><span>JUL</span><span>SEP</span><span>NOV</span><span>JAN</span><span>MAR</span><span>MEI</span></div>
        </div>
        <span className="login-visual-index" aria-hidden="true">01 / 03</span>
      </section>

      <section className="login-content">
        <div className="login-card">
          <span className="login-mobile-brand"><i /> {school}</span>
          <span className="login-overline">AKSES AKUN</span>
          <h2>Masuk ke akun Anda</h2>
          <p className="login-intro">Gunakan username dan kata sandi yang terdaftar.</p>
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="login-username">Username</label>
              <input
                id="login-username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Masukkan username"
                required
              />
            </div>
            <div className="login-field">
              <label htmlFor="login-password">Kata sandi</label>
              <div className="login-password-wrap">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Masukkan kata sandi"
                  required
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  title={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="login-submit" type="submit" disabled={submitting}>
              {submitting ? "Memverifikasi..." : "Masuk ke portal"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="login-secure"><ShieldCheck size={15} /><span>Akses aman · sesi berakhir saat tab ditutup</span></div>
        </div>
        <footer className="login-footer"><span>© 2026 {school}</span><span>Butuh bantuan? Hubungi administrator sekolah.</span></footer>
      </section>
    </main>
  );
}

function Dashboard({
  students,
  transactions,
  totalPaid,
  outstanding,
  onGo,
  onReceipt,
}: {
  students: Student[];
  transactions: Transaction[];
  totalPaid: number;
  outstanding: number;
  onGo: (page: Page) => void;
  onReceipt: (item: Transaction) => void;
}) {
  const averagePaid = Math.round(
    (students.reduce((sum, student) => sum + student.paid.length, 0) /
      (students.length * 12)) *
      100,
  );
  return (
    <>
      <div className="metrics-grid">
        <article className="metric-card metric-highlight">
          <div className="metric-top">
            <span>Total penerimaan</span>
            <div className="metric-icon green">
              <Wallet size={18} />
            </div>
          </div>
          <strong>{money(totalPaid)}</strong>
          <div className="metric-foot">
            <span className="trend positive">
              <ArrowUpRight size={14} /> 12,8%
            </span>
            <span>dibanding bulan lalu</span>
          </div>
          <div className="metric-spark spark-green">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-top">
            <span>Tunggakan SPP</span>
            <div className="metric-icon amber">
              <CircleDollarSign size={18} />
            </div>
          </div>
          <strong>{money(outstanding)}</strong>
          <div className="metric-foot">
            <span className="metric-caption">
              {students.reduce(
                (sum, student) => sum + (12 - student.paid.length),
                0,
              )}{" "}
              tagihan belum lunas
            </span>
          </div>
          <div className="metric-spark spark-amber">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-top">
            <span>Siswa terdaftar</span>
            <div className="metric-icon blue">
              <Users size={18} />
            </div>
          </div>
          <strong>
            {String(students.length).padStart(2, "0")} <small>siswa</small>
          </strong>
          <div className="metric-foot">
            <span className="metric-caption">Tersebar di 6 tingkat kelas</span>
          </div>
          <div className="class-dots">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-top">
            <span>Realisasi SPP</span>
            <div className="metric-icon coral">
              <BookOpenCheck size={18} />
            </div>
          </div>
          <strong>
            {averagePaid}
            <small>%</small>
          </strong>
          <div className="metric-foot">
            <span className="metric-caption">Dari total tagihan tahun ini</span>
          </div>
          <div className="progress-track">
            <i style={{ width: `${averagePaid}%` }} />
          </div>
        </article>
      </div>
      <div className="dashboard-grid">
        <section className="panel revenue-panel">
          <div className="panel-heading">
            <div>
              <h2>Arus penerimaan</h2>
              <p>Tren pemasukan tahun ajaran 2026/2027</p>
            </div>
            <button className="select-button">
              Tahun ajaran <ChevronDown size={14} />
            </button>
          </div>
          <div className="chart-summary">
            <strong>Rp 186,4 jt</strong>
            <span>
              <i /> Penerimaan bulanan
            </span>
            <div className="chart-change">
              <ArrowUpRight size={15} /> 8,4%
            </div>
          </div>
          <div className="bar-chart" aria-label="Grafik penerimaan per bulan">
            {revenue.map((height, index) => (
              <div className="chart-column" key={months[index]}>
                <div
                  className={`bar ${index === 11 ? "current" : ""}`}
                  style={{ height: `${height}%` }}
                >
                  <span>{height}</span>
                </div>
                <small>{months[index]}</small>
              </div>
            ))}
          </div>
          <div className="chart-baseline">
            <span>Jul 2026</span>
            <span>Jun 2027</span>
          </div>
        </section>
        <section className="panel status-panel">
          <div className="panel-heading">
            <div>
              <h2>Status pembayaran</h2>
              <p>Realisasi SPP tahun berjalan</p>
            </div>
            <button
              className="icon-button"
              aria-label="Lihat laporan"
              onClick={() => onGo("laporan")}
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="donut-wrap">
            <div
              className="donut"
              style={{ "--progress": `${averagePaid}%` } as React.CSSProperties}
            >
              <div>
                <strong>{averagePaid}%</strong>
                <span>terbayar</span>
              </div>
            </div>
            <div className="status-legend">
              <div>
                <i className="legend-paid" />
                <span>Sudah dibayar</span>
                <strong>
                  {students.reduce((sum, item) => sum + item.paid.length, 0)}
                </strong>
              </div>
              <div>
                <i className="legend-unpaid" />
                <span>Belum dibayar</span>
                <strong>
                  {students.reduce(
                    (sum, item) => sum + 12 - item.paid.length,
                    0,
                  )}
                </strong>
              </div>
            </div>
          </div>
          <button className="text-link" onClick={() => onGo("pembayaran")}>
            Lihat daftar tagihan <ArrowUpRight size={14} />
          </button>
        </section>
      </div>
      <section className="panel transaction-panel">
        <div className="panel-heading">
          <div>
            <h2>Transaksi terbaru</h2>
            <p>Penerimaan yang tercatat di sistem</p>
          </div>
          <button className="text-link" onClick={() => onGo("laporan")}>
            Lihat semua <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SISWA</th>
                <th>RINCIAN</th>
                <th>TANGGAL</th>
                <th>JUMLAH</th>
                <th>STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 4).map((item, index) => (
                <tr key={`${item.id}-${index}`}>
                  <td>
                    <div className="table-person">
                      <div className={`student-avatar avatar-${index % 4}`}>
                        {item.student
                          .split(" ")
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")}
                      </div>
                      <span>
                        <strong>{item.student}</strong>
                        <small>{item.id}</small>
                      </span>
                    </div>
                  </td>
                  <td>{item.detail}</td>
                  <td className="muted-cell">{item.date}</td>
                  <td className="amount-cell">{money(item.amount)}</td>
                  <td>
                    <span className="status-pill">
                      <i /> {item.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="icon-button row-action"
                      title="Lihat kuitansi"
                      onClick={() => onReceipt(item)}
                    >
                      <ReceiptText size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="dashboard-bottom">
        <section className="panel class-panel">
          <div className="panel-heading">
            <div>
              <h2>Ringkasan per kelas</h2>
              <p>Persentase pembayaran SPP</p>
            </div>
            <button
              className="icon-button"
              aria-label="Lihat siswa"
              onClick={() => onGo("siswa")}
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="class-list">
            {[
              "Kelas I",
              "Kelas II",
              "Kelas III",
              "Kelas IV",
              "Kelas V",
              "Kelas VI",
            ].map((className) => {
              const group = students.filter(
                (student) => student.className === className,
              );
              const paid = group.length
                ? Math.round(
                    (group.reduce(
                      (sum, student) => sum + student.paid.length,
                      0,
                    ) /
                      (group.length * 12)) *
                      100,
                  )
                : 0;
              return (
                <div className="class-row" key={className}>
                  <span>{className}</span>
                  <div className="progress-track">
                    <i style={{ width: `${paid}%` }} />
                  </div>
                  <strong>{paid}%</strong>
                  <small>{group.length} siswa</small>
                </div>
              );
            })}
          </div>
        </section>
        <section className="notice-card">
          <div className="notice-icon">
            <Banknote size={19} />
          </div>
          <span className="notice-label">PENGINGAT</span>
          <h3>Tutup buku bulan ini</h3>
          <p>
            Pastikan seluruh transaksi bulan Oktober sudah direkap sebelum
            tanggal 31.
          </p>
          <button onClick={() => onGo("laporan")}>
            Buka laporan Oktober <ArrowRight size={15} />
          </button>
          <div className="notice-decoration">10</div>
        </section>
      </div>
    </>
  );
}

function StudentsPage({
  students,
  sppAmounts,
  search,
  setSearch,
  onPay,
  onAdd,
}: {
  students: Student[];
  sppAmounts: number[];
  search: string;
  setSearch: (value: string) => void;
  onPay: (student: Student) => void;
  onAdd: () => void;
}) {
  return (
    <section className="panel listing-panel">
      <div className="list-toolbar">
        <div>
          <h2>
            Semua siswa <span className="count-badge">{students.length}</span>
          </h2>
          <p>Tahun ajaran 2026 / 2027</p>
        </div>
        <div className="toolbar-controls">
          <label className="search-box">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama atau NIS..."
            />
            <kbd>⌘ K</kbd>
          </label>
          <button className="button button-primary compact-add" onClick={onAdd}>
            <Plus size={16} /> Tambah siswa
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>NAMA SISWA</th>
              <th>NIS / NISN</th>
              <th>KELAS</th>
              <th>PEMBAYARAN SPP</th>
              <th>SISA TAGIHAN</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {students.map((student, index) => (
              <tr key={student.id}>
                <td>
                  <div className="table-person">
                    <div className={`student-avatar avatar-${index % 4}`}>
                      {student.name
                        .split(" ")
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")}
                    </div>
                    <span>
                      <strong>{student.name}</strong>
                      <small>Terdaftar tahun ajaran 2026/27</small>
                    </span>
                  </div>
                </td>
                <td>
                  <span className="id-cell">{student.id}</span>
                  <small className="secondary-id">NISN {student.nisn}</small>
                </td>
                <td>
                  <span className="class-tag">{student.className}</span>
                </td>
                <td>
                  <div className="payment-state">
                    <span>{student.paid.length} dari 12 bulan</span>
                    <div className="mini-progress">
                      <i
                        style={{
                          width: `${(student.paid.length / 12) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td className="amount-cell">
                  {money(
                    (12 - student.paid.length) *
                      studentSppAmount(student, sppAmounts),
                  )}
                </td>
                <td>
                  <button
                    className="button button-table"
                    onClick={() => onPay(student)}
                  >
                    Bayar <ArrowUpRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {students.length === 0 && (
          <div className="empty-state">
            <Search size={22} />
            <strong>Siswa tidak ditemukan</strong>
            <span>Coba kata kunci lain untuk pencarian.</span>
          </div>
        )}
      </div>
      <div className="table-footer">
        <span>
          Menampilkan <strong>{students.length}</strong> data siswa
        </span>
        <div>
          <button
            className="icon-button"
            aria-label="Halaman sebelumnya"
            disabled
          >
            <ChevronLeft size={17} />
          </button>
          <button className="page-number">1</button>
          <button
            className="icon-button"
            aria-label="Halaman berikutnya"
            disabled
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
    </section>
  );
}

function PaymentPage({
  students,
  sppAmounts,
  search,
  setSearch,
  onPay,
}: {
  students: Student[];
  sppAmounts: number[];
  search: string;
  setSearch: (value: string) => void;
  onPay: (student: Student, kind?: "spp" | "non-spp") => void;
}) {
  const [selected, setSelected] = useState<Student | null>(null);
  return (
    <div className="payment-layout">
      <section className="panel payment-search-panel">
        <div className="panel-heading">
          <div>
            <h2>Cari siswa</h2>
            <p>Pilih siswa untuk melihat tagihan aktif.</p>
          </div>
          <div className="metric-icon green">
            <Search size={17} />
          </div>
        </div>
        <label className="search-box payment-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nama, NIS, atau NISN"
          />
        </label>
        <div className="student-results">
          {students.map((student, index) => (
            <button
              key={student.id}
              className={`student-result ${selected?.id === student.id ? "chosen" : ""}`}
              onClick={() => setSelected(student)}
            >
              <div className={`student-avatar avatar-${index % 4}`}>
                {student.name
                  .split(" ")
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")}
              </div>
              <span>
                <strong>{student.name}</strong>
                <small>
                  {student.id} · {student.className}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      </section>
      {selected ? (
        <section className="panel billing-panel">
          <div className="billing-header">
            <div>
              <span className="eyebrow">RINCIAN TAGIHAN</span>
              <h2>{selected.name}</h2>
              <p>
                {selected.id} · {selected.className} · Tahun ajaran 2026/2027
              </p>
            </div>
            <button
              className="button button-primary"
              onClick={() => onPay(selected)}
            >
              <Plus size={16} /> Catat pembayaran
            </button>
          </div>
          <div className="billing-summary">
            <div>
              <span>Total tunggakan SPP</span>
              <strong>
                {money(
                  (12 - selected.paid.length) *
                    studentSppAmount(selected, sppAmounts),
                )}
              </strong>
            </div>
            <div>
              <span>Bulan belum dibayar</span>
              <strong>
                {12 - selected.paid.length} <small>bulan</small>
              </strong>
            </div>
            <button
              className="button button-outline"
              onClick={() => onPay(selected, "non-spp")}
            >
              <CircleDollarSign size={16} /> Bayar biaya lain
            </button>
          </div>
          <h3 className="subsection-title">
            Tagihan SPP <span>Tahun ajaran 2026 / 2027</span>
          </h3>
          <div className="bill-months">
            {monthNames.map((month, index) => (
              <div
                key={month}
                className={`bill-month ${selected.paid.includes(index) ? "paid" : "unpaid"}`}
              >
                <span>{month}</span>
                <strong>
                  {selected.paid.includes(index) ? "Lunas" : "Belum bayar"}
                </strong>
                <small>{money(studentSppAmount(selected, sppAmounts))}</small>
              </div>
            ))}
          </div>
          <div className="billing-note">
            <ShieldCheck size={16} />
            <span>
              Tarif mengikuti pengaturan SPP kelas{" "}
              {selected.className.replace("Kelas ", "")} untuk tahun ajaran ini.
            </span>
          </div>
        </section>
      ) : (
        <section className="panel billing-empty">
          <div className="empty-illustration">
            <ReceiptText size={25} />
          </div>
          <h2>Pilih siswa untuk memulai</h2>
          <p>Informasi tagihan dan histori pembayaran akan tampil di sini.</p>
        </section>
      )}
    </div>
  );
}

function ReportsPage({
  transactions,
  students,
  reportClass,
  setReportClass,
  onExport,
}: {
  transactions: Transaction[];
  students: Student[];
  reportClass: string;
  setReportClass: (value: string) => void;
  onExport: (
    format: "csv" | "pdf",
    reportTransactions: Transaction[],
    classFilter: string,
  ) => Promise<void>;
}) {
  const filteredTransactions = transactions.filter(
    (item) =>
      reportClass === "Semua kelas" ||
      students.some(
        (student) =>
          student.name === item.student && student.className === reportClass,
      ),
  );
  const total = filteredTransactions.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const average = filteredTransactions.length
    ? Math.round(total / filteredTransactions.length)
    : 0;
  return (
    <>
      <section className="report-summary">
        <article className="panel report-total">
          <span>Total penerimaan tercatat</span>
          <strong>
            {money(total)}
          </strong>
          <small>
            <ArrowUpRight size={14} /> 8,4% dari periode sebelumnya
          </small>
        </article>
        <article className="panel report-total">
          <span>Jumlah transaksi</span>
          <strong>{String(filteredTransactions.length).padStart(2, "0")}</strong>
          <small>Transaksi tahun ajaran ini</small>
        </article>
        <article className="panel report-total">
          <span>Rata-rata per transaksi</span>
          <strong>
            {money(average)}
          </strong>
          <small>Seluruh pos pembayaran</small>
        </article>
      </section>
      <section className="panel listing-panel">
        <div className="list-toolbar">
          <div>
            <h2>Realisasi pembayaran</h2>
            <p>Daftar transaksi tahun ajaran 2026 / 2027</p>
          </div>
          <div className="toolbar-controls">
            <select
              className="filter-select"
              value={reportClass}
              onChange={(event) => setReportClass(event.target.value)}
            >
              <option>Semua kelas</option>
              {[
                "Kelas I",
                "Kelas II",
                "Kelas III",
                "Kelas IV",
                "Kelas V",
                "Kelas VI",
              ].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <button
              className="button button-outline"
              onClick={() => void onExport("csv", filteredTransactions, reportClass)}
            >
              <FileSpreadsheet size={16} /> Ekspor CSV
            </button>
            <button
              className="button button-primary"
              onClick={() => void onExport("pdf", filteredTransactions, reportClass)}
            >
              <Download size={16} /> Unduh PDF
            </button>
          </div>
        </div>
        <div className="report-filter-strip">
          <span>
            <CalendarDays size={15} /> Tahun ajaran:{" "}
            <strong>2026 / 2027</strong>
          </span>
          <span>
            <SlidersHorizontal size={15} /> Periode:{" "}
            <strong>Semua bulan</strong>
          </span>
          <span className="report-record-count">
            {filteredTransactions.length} transaksi sesuai filter
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NO. TRANSAKSI</th>
                <th>NAMA SISWA</th>
                <th>RINCIAN</th>
                <th>TANGGAL</th>
                <th>JUMLAH</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((item, index) => (
                <tr key={`${item.id}-${index}`}>
                  <td>
                    <span className="id-cell">{item.id}</span>
                  </td>
                  <td>
                    <strong>{item.student}</strong>
                  </td>
                  <td>{item.detail}</td>
                  <td className="muted-cell">{item.date}</td>
                  <td className="amount-cell">{money(item.amount)}</td>
                  <td>
                    <span className="status-pill">
                      <i /> Lunas
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>
            Menampilkan <strong>{filteredTransactions.length}</strong> transaksi
            terbaru
          </span>
          <span>Data tersinkron secara real-time</span>
        </div>
      </section>
    </>
  );
}

function SettingsPage({
  activeTab,
  setActiveTab,
  sppAmounts,
  setSppAmounts,
}: {
  activeTab: "spp" | "biaya";
  setActiveTab: (value: "spp" | "biaya") => void;
  sppAmounts: number[];
  setSppAmounts: React.Dispatch<React.SetStateAction<number[]>>;
}) {
  const [amounts, setAmounts] = useState(costs.map((cost) => cost.amount));
  const [saved, setSaved] = useState(false);
  return (
    <section className="panel settings-panel">
      <div className="settings-tabs">
        <button
          className={activeTab === "spp" ? "active" : ""}
          onClick={() => setActiveTab("spp")}
        >
          <BookOpenCheck size={16} /> Tarif SPP
        </button>
        <button
          className={activeTab === "biaya" ? "active" : ""}
          onClick={() => setActiveTab("biaya")}
        >
          <CircleDollarSign size={16} /> Biaya non-SPP
        </button>
      </div>
      {activeTab === "spp" ? (
        <div className="settings-content">
          <div className="settings-title">
            <div>
              <span className="eyebrow">TAHUN AJARAN 2026 / 2027</span>
              <h2>Tarif SPP per tingkat kelas</h2>
              <p>Nominal berlaku untuk periode semester ganjil dan genap.</p>
            </div>
            <span className="active-badge">
              <i /> Tahun aktif
            </span>
          </div>
          <div className="semester-cards">
            <article>
              <div className="semester-head">
                <div>
                  <span>PERIODE I</span>
                  <h3>Semester Ganjil</h3>
                </div>
                <span className="semester-date">Juli — Desember</span>
              </div>
              <div className="semester-months">
                {months.slice(0, 6).map((month) => (
                  <span key={month}>{month}</span>
                ))}
              </div>
              <small>6 bulan pembayaran</small>
            </article>
            <article>
              <div className="semester-head">
                <div>
                  <span>PERIODE II</span>
                  <h3>Semester Genap</h3>
                </div>
                <span className="semester-date">Januari — Juni</span>
              </div>
              <div className="semester-months">
                {months.slice(6).map((month) => (
                  <span key={month}>{month}</span>
                ))}
              </div>
              <small>6 bulan pembayaran</small>
            </article>
          </div>
          <div className="tariff-table">
            <div className="tariff-row tariff-header">
              <span>TINGKAT KELAS</span>
              <span>NOMINAL PER BULAN</span>
              <span>STATUS</span>
            </div>
            {[
              "Kelas I",
              "Kelas II",
              "Kelas III",
              "Kelas IV",
              "Kelas V",
              "Kelas VI",
            ].map((className, index) => (
              <div className="tariff-row" key={className}>
                <span>
                  <div className={`class-emblem emblem-${index % 3}`}>
                    {["I", "II", "III", "IV", "V", "VI"][index]}
                  </div>
                  <strong>{className}</strong>
                </span>
                <label className="money-input">
                  <span>Rp</span>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={sppAmounts[index] ?? sppAmounts[0]}
                    onChange={(event) =>
                      setSppAmounts((current) =>
                        current.map((amount, itemIndex) =>
                          itemIndex === index
                            ? Number(event.target.value)
                            : amount,
                        ),
                      )
                    }
                    aria-label={`Tarif SPP ${className}`}
                  />
                </label>
                <span className="active-badge">
                  <i /> Aktif
                </span>
              </div>
            ))}
          </div>
          <div className="settings-tip">
            <Sparkles size={17} />
            <span>
              <strong>Penyesuaian tarif otomatis</strong> · Perubahan berlaku
              untuk tagihan yang belum dibayar.
            </span>
          </div>
          <div className="settings-actions">
            <span>Terakhir diperbarui 28 September 2026</span>
            <button
              className="button button-primary"
              onClick={() => setSaved(true)}
            >
              <Check size={16} />{" "}
              {saved ? "Perubahan tersimpan" : "Simpan pengaturan"}
            </button>
          </div>
        </div>
      ) : (
        <div className="settings-content">
          <div className="settings-title">
            <div>
              <span className="eyebrow">POS PEMBAYARAN</span>
              <h2>Tarif biaya non-SPP</h2>
              <p>Kelola nominal dan tipe pembayaran untuk setiap pos biaya.</p>
            </div>
            <button className="button button-outline">
              <Plus size={15} /> Tambah pos
            </button>
          </div>
          <div className="cost-list">
            {costs.map((cost, index) => (
              <article className="cost-row" key={cost.name}>
                <div className="cost-icon">
                  <Banknote size={17} />
                </div>
                <div className="cost-name">
                  <strong>{cost.name}</strong>
                  <span>{cost.type}</span>
                </div>
                <label className="money-input">
                  <span>Rp</span>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={amounts[index]}
                    onChange={(event) =>
                      setAmounts((items) =>
                        items.map((value, itemIndex) =>
                          itemIndex === index
                            ? Number(event.target.value)
                            : value,
                        ),
                      )
                    }
                    aria-label={`Tarif ${cost.name}`}
                  />
                </label>
                <button
                  className="switch-control on"
                  aria-label={`${cost.name} aktif`}
                >
                  <i />
                </button>
              </article>
            ))}
          </div>
          <div className="settings-actions">
            <span>Tarif dapat dibedakan untuk tiap tingkat kelas.</span>
            <button
              className="button button-primary"
              onClick={() => setSaved(true)}
            >
              <Check size={16} />{" "}
              {saved ? "Perubahan tersimpan" : "Simpan pengaturan"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ProfilePage({
  profile,
  setProfile,
  uploadLogo,
  onUploadFavicon,
  onRemoveFavicon,
  faviconBusy,
  onSave,
}: {
  profile: Profile;
  setProfile: React.Dispatch<React.SetStateAction<Profile>>;
  uploadLogo: (file?: File) => void;
  onUploadFavicon: (file?: File) => void;
  onRemoveFavicon: () => void;
  faviconBusy: boolean;
  onSave: () => void;
}) {
  return (
    <div className="profile-layout">
      <section className="panel profile-form">
        <div className="panel-heading">
          <div>
            <h2>Identitas sekolah</h2>
            <p>Informasi resmi untuk aplikasi dan dokumen pembayaran.</p>
          </div>
          <Building2 size={20} />
        </div>
        <div className="logo-field">
          <div className="logo-preview">
            {profile.logo ? (
              <img src={profile.logo} alt="Logo sekolah" />
            ) : (
              <GraduationCap size={27} />
            )}
          </div>
          <div>
            <strong>Logo sekolah</strong>
            <span>PNG, JPG, atau WebP · Maksimal 2 MB</span>
            <label className="button button-outline upload-button">
              <ArrowDownToLine size={15} /> Unggah logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => uploadLogo(event.target.files?.[0])}
              />
            </label>
          </div>
        </div>
        <div className="favicon-field">
          <div className="favicon-preview">
            {profile.favicon ? (
              <img src={profile.favicon} alt="Favicon sekolah" />
            ) : (
              <GraduationCap size={15} />
            )}
          </div>
          <div className="favicon-detail">
            <strong>Favicon tab browser</strong>
            <span>PNG, JPG, WebP, atau ICO · Maksimal 512 KB</span>
            <div className="favicon-actions">
              <label className={`button button-outline upload-button ${faviconBusy ? "is-busy" : ""}`}>
                {faviconBusy ? <RefreshCw size={15} /> : <Upload size={15} />}
                {faviconBusy ? "Menyimpan" : "Unggah favicon"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.ico"
                  disabled={faviconBusy}
                  onChange={(event) => {
                    onUploadFavicon(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              {profile.favicon && (
                <button
                  type="button"
                  className="button button-ghost"
                  disabled={faviconBusy}
                  onClick={onRemoveFavicon}
                >
                  <Trash size={15} /> Kembalikan bawaan
                </button>
              )}
            </div>
          </div>
          <div className="favicon-tab" aria-hidden="true">
            <span className="favicon-tab-icon">
              {profile.favicon ? (
                <img src={profile.favicon} alt="" />
              ) : (
                <GraduationCap size={11} />
              )}
            </span>
            <span className="favicon-tab-text">
              {profile.school || "Portal Keuangan"}
            </span>
          </div>
        </div>
        <div className="form-grid">
          <div className="form-field full">
            <label htmlFor="profile-school">Nama sekolah</label>
            <input
              id="profile-school"
              value={profile.school}
              onChange={(event) =>
                setProfile((value) => ({
                  ...value,
                  school: event.target.value,
                }))
              }
            />
          </div>
          <div className="form-field full">
            <label htmlFor="profile-foundation">Nama yayasan / instansi</label>
            <input
              id="profile-foundation"
              value={profile.foundation}
              onChange={(event) =>
                setProfile((value) => ({
                  ...value,
                  foundation: event.target.value,
                }))
              }
            />
          </div>
          <div className="form-field full">
            <label htmlFor="profile-address">Alamat lengkap</label>
            <textarea
              id="profile-address"
              rows={2}
              value={profile.address}
              onChange={(event) =>
                setProfile((value) => ({
                  ...value,
                  address: event.target.value,
                }))
              }
            />
          </div>
          <div className="form-field">
            <label htmlFor="profile-phone">Nomor telepon</label>
            <input
              id="profile-phone"
              value={profile.phone}
              onChange={(event) =>
                setProfile((value) => ({ ...value, phone: event.target.value }))
              }
            />
          </div>
          <div className="form-field">
            <label htmlFor="profile-email">Email sekolah</label>
            <input
              id="profile-email"
              type="email"
              value={profile.email}
              onChange={(event) =>
                setProfile((value) => ({ ...value, email: event.target.value }))
              }
            />
          </div>
          <div className="form-field full">
            <label htmlFor="profile-note">Catatan pada kuitansi</label>
            <input
              id="profile-note"
              value={profile.note}
              onChange={(event) =>
                setProfile((value) => ({ ...value, note: event.target.value }))
              }
            />
          </div>
        </div>
        <div className="profile-actions">
          <span>Perubahan identitas tersimpan otomatis di browser ini.</span>
          <button className="button button-primary" onClick={onSave}>
            <Check size={16} /> Simpan profil
          </button>
        </div>
      </section>
      <aside className="profile-aside">
        <div className="preview-label">
          <span>PRATINJAU DOKUMEN</span>
          <ReceiptText size={17} />
        </div>
        <div className="mini-receipt">
          <div className="mini-receipt-brand">
            {profile.logo ? (
              <img src={profile.logo} alt="" />
            ) : (
              <div>
                <GraduationCap size={18} />
              </div>
            )}
            <span>
              <strong>{profile.school}</strong>
              <small>{profile.address}</small>
            </span>
          </div>
          <div className="mini-receipt-line" />
          <strong className="mini-receipt-title">BUKTI PEMBAYARAN</strong>
          <div className="mini-line">
            <span>Nama siswa</span>
            <i />
          </div>
          <div className="mini-line">
            <span>Rincian</span>
            <i />
          </div>
          <div className="mini-line">
            <span>Tanggal</span>
            <i />
          </div>
          <div className="mini-total">
            <span>Total</span>
            <strong>Rp 350.000</strong>
          </div>
          <p>{profile.note}</p>
        </div>
        <div className="profile-hint">
          <ShieldCheck size={17} />
          <span>
            Favicon yang diunggah langsung tampil di tab browser seluruh pengguna
            dan tersimpan di server, sedangkan identitas teks di atas disimpan di
            browser ini.
          </span>
        </div>
      </aside>
    </div>
  );
}

export default App;
