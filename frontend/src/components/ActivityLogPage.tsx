import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FilterX,
  History,
  Loader2,
  Search,
  ShieldAlert,
} from "lucide-react";
import type { ActivityLogEntry, ActivityLogResult } from "../api";
import { money } from "../lib/format";

/**
 * Fields worth surfacing in the Detail column.
 *
 * Deliberately a curated allow-list: the stored payload also carries foreign
 * keys such as `academic_year_id`, which mean nothing to a reader and would
 * turn the table into a database dump.
 */
const DETAIL_LABELS: Record<string, string> = {
  amount: "Nominal",
  monthly_amount: "Nominal",
  months: "Bulan dibayar",
  position: "Pos biaya",
  transaction_number: "No. transaksi",
  class_level: "Kelas",
  email: "Email",
  school_name: "Sekolah",
  field: "Berkas",
};

/** Render one detail value for humans, or null when it is not worth showing. */
function detailValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (key === "amount" || key === "monthly_amount") {
    const amount = Number(value);
    return Number.isFinite(amount) ? money(amount) : null;
  }
  // `months` is a list of month numbers; the count is what a reader wants.
  if (key === "months") {
    return Array.isArray(value) ? `${value.length} bulan` : null;
  }
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  // Nested arrays/objects are internal shape, never human-readable.
  if (typeof value === "object") return null;
  return String(value);
}

/** Ordered detail chips for one row. */
function detailChips(entry: ActivityLogEntry): { label: string; value: string }[] {
  const chips: { label: string; value: string }[] = [];
  for (const key of Object.keys(DETAIL_LABELS)) {
    const value = detailValue(key, entry.details[key]);
    if (value !== null) chips.push({ label: DETAIL_LABELS[key], value });
  }
  return chips;
}

/** "3 Okt 2026 · 14:05" — absolute row timestamp in the viewer's locale. */
function formatStamp(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const day = date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const clock = date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} · ${clock}`;
}

/** Relative wording for recent rows so "today" reads at a glance. */
function relativeTime(value: string | null): string {
  if (!value) return "Waktu tidak diketahui";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "Waktu tidak diketahui";

  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return formatStamp(value);
}

export function ActivityLogPage({
  category,
  error,
  from,
  loading,
  onCategoryChange,
  onFromChange,
  onPageChange,
  onReset,
  onSearchChange,
  onToChange,
  page,
  result,
  search,
  to,
}: {
  category: string;
  error: string;
  from: string;
  loading: boolean;
  onCategoryChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onReset: () => void;
  onSearchChange: (value: string) => void;
  onToChange: (value: string) => void;
  page: number;
  result: ActivityLogResult | undefined;
  search: string;
  to: string;
}) {
  const entries = result?.entries ?? [];
  const summary = result?.summary;
  const categories = result?.categories ?? [];
  const totalPages = result?.lastPage ?? 1;
  const filtering = Boolean(search.trim() || category || from || to);

  return (
    <>
      <section className="metrics-grid log-metrics">
        <article className="panel metric-card">
          <div className="metric-top">
            <span>Total aktivitas</span>
            <span className="metric-icon">
              <History size={15} />
            </span>
          </div>
          <strong>
            {summary ? summary.total.toLocaleString("id-ID") : "—"}
          </strong>
          <small className="metric-note">Seluruh catatan tersimpan</small>
        </article>
        <article className="panel metric-card">
          <div className="metric-top">
            <span>Aktivitas hari ini</span>
            <span className="metric-icon">
              <CalendarDays size={15} />
            </span>
          </div>
          <strong>
            {summary ? summary.today.toLocaleString("id-ID") : "—"}
          </strong>
          <small className="metric-note">Sejak pukul 00.00</small>
        </article>
        <article className="panel metric-card">
          <div className="metric-top">
            <span>Pengguna tercatat</span>
            <span className="metric-icon">
              <ShieldAlert size={15} />
            </span>
          </div>
          <strong>
            {summary ? summary.actors.toLocaleString("id-ID") : "—"}
          </strong>
          <small className="metric-note">Akun yang pernah beraktivitas</small>
        </article>
        <article className="panel metric-card">
          <div className="metric-top">
            <span>Sesuai filter</span>
            <span className="metric-icon">
              <Search size={15} />
            </span>
          </div>
          <strong>
            {summary ? summary.filtered.toLocaleString("id-ID") : "—"}
          </strong>
          <small className="metric-note">Baris yang cocok</small>
        </article>
      </section>

      <section className="panel listing-panel">
        <div className="list-toolbar">
          <div>
            <h2>
              Jejak aktivitas
              <span className="count-badge">{entries.length}</span>
            </h2>
            <p>Catatan siapa melakukan apa, tersusun dari yang terbaru</p>
          </div>
          <div className="toolbar-controls">
            <label className="search-box">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Cari aktivitas, pelaku, atau target"
                aria-label="Cari aktivitas"
              />
            </label>
            <select
              className="filter-select"
              value={category}
              onChange={(event) => onCategoryChange(event.target.value)}
              aria-label="Filter kategori"
            >
              <option value="">Semua kategori</option>
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                  {summary?.byCategory[item.value]
                    ? ` (${summary.byCategory[item.value].toLocaleString("id-ID")})`
                    : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="report-filter-strip log-filter-strip">
          <label className="log-date-field">
            <span>Dari tanggal</span>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => onFromChange(event.target.value)}
            />
          </label>
          <label className="log-date-field">
            <span>Sampai tanggal</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => onToChange(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="button button-outline log-reset"
            onClick={onReset}
            disabled={!filtering}
          >
            <FilterX size={15} /> Atur ulang
          </button>
          <span className="report-record-count">
            {summary ? summary.filtered.toLocaleString("id-ID") : "0"} aktivitas
            sesuai filter
          </span>
        </div>
        {error ? (
          <p className="form-error log-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Aktivitas</th>
                <th>Kategori</th>
                <th>Pelaku</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {loading && entries.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <span className="log-loading">
                      <Loader2 size={15} className="spin" /> Memuat log…
                    </span>
                  </td>
                </tr>
              ) : null}
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="log-time-cell">
                    <strong title={formatStamp(entry.created_at)}>
                      {relativeTime(entry.created_at)}
                    </strong>
                  </td>
                  <td className="log-activity-cell">
                    <span>{entry.description}</span>
                    <small className="secondary-id">{entry.action}</small>
                  </td>
                  <td>
                    <span
                      className={`status-pill log-badge log-badge-${entry.category}`}
                    >
                      <i /> {entry.category_label}
                    </span>
                  </td>
                  <td>
                    <div className="table-person">
                      <span>
                        <strong>{entry.actor.name ?? "Sistem"}</strong>
                        <small>{entry.actor.role_label}</small>
                      </span>
                    </div>
                  </td>
                  <td className="log-detail-cell">
                    {entry.subject?.label ? (
                      <span className="class-tag log-subject">
                        {entry.subject.label}
                      </span>
                    ) : null}
                    {detailChips(entry).map((chip) => (
                      <span className="log-chip" key={chip.label}>
                        {chip.label}: <strong>{chip.value}</strong>
                      </span>
                    ))}
                    {entry.ip_address ? (
                      <span className="log-chip log-chip-muted">
                        IP {entry.ip_address}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && entries.length === 0 ? (
            <div className="empty-state">
              <History size={22} />
              <strong>Belum ada aktivitas tercatat</strong>
              {filtering
                ? "Tidak ada catatan yang cocok dengan filter saat ini."
                : "Aktivitas akan muncul di sini setelah ada perubahan data."}
            </div>
          ) : null}
        </div>
        <div className="table-footer">
          <span>
            Halaman <strong>{page}</strong> dari <strong>{totalPages}</strong> ·{" "}
            {result ? result.total.toLocaleString("id-ID") : "0"} catatan
          </span>
          <div>
            <button
              type="button"
              className="icon-button"
              aria-label="Halaman sebelumnya"
              disabled={page <= 1 || loading}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            <span className="page-number">{page}</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Halaman berikutnya"
              disabled={page >= totalPages || loading}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

export default ActivityLogPage;
