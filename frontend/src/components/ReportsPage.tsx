import { useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Printer,
  Sheet,
  SlidersHorizontal,
} from "lucide-react";
import type { Transaction } from "../types";
import { longMonths, money } from "../lib/format";
import type { ReportSections } from "../reportPdf";

/**
 * The parts a printed report can be limited to. A treasurer collecting a
 * payment receipt does not need a page of arrears, and one chasing unpaid
 * bills does not need every transaction.
 */
const SECTION_OPTIONS: { key: keyof ReportSections; label: string }[] = [
  { key: "payments", label: "Pembayaran (SPP & biaya)" },
  { key: "billStatus", label: "Status tagihan SPP" },
  { key: "arrears", label: "Rincian tunggakan" },
];

/**
 * Report filters are two independent axes and both default to "everything".
 *
 * The month list runs Jan..Dec because the filter matches the calendar month of
 * `paid_at`, and that is the number the server understands. `longMonths` is the
 * calendar-ordered list; `constants.monthNames` is deliberately *not* used here
 * because it runs Jul..Jun to match the SPP billing order — indexing that array
 * by calendar month makes "Oktober" send 4 and quietly return the wrong rows.
 */
const MONTH_OPTIONS = longMonths.map((label, index) => ({
  label,
  value: index + 1,
}));

export function ReportsPage({
  rows,
  loading,
  loadError,
  truncated,
  academicYearLabel,
  yearOptions,
  reportYearId,
  setReportYearId,
  classLevels,
  reportClassId,
  setReportClassId,
  reportMonth,
  setReportMonth,
  onExport,
  sections,
  setSections,
  busy = false,
}: {
  /** Full, server-filtered report rows (never a truncated portal feed). */
  rows: Transaction[];
  loading: boolean;
  loadError: string;
  /** Server hit its safety cap — the report is not the complete picture. */
  truncated: boolean;
  academicYearLabel: string;
  /** Academic years available to filter by, newest first. */
  yearOptions: { id: number; name: string }[];
  /** `null` follows the year chosen in the topbar; otherwise an explicit year. */
  reportYearId: number | null;
  setReportYearId: (value: number | null) => void;
  classLevels: { id: number; name: string }[];
  /** `null` means "all classes"; otherwise a single class level id. */
  reportClassId: number | null;
  setReportClassId: (value: number | null) => void;
  /** `0` means "all months"; otherwise the calendar month number (1..12). */
  reportMonth: number;
  setReportMonth: (value: number) => void;
  onExport: (
    format: "csv" | "xlsx" | "pdf" | "print",
    reportTransactions: Transaction[],
    classFilter: string,
    monthFilter: string,
    sections: ReportSections,
  ) => Promise<void>;
  /** Which parts of the printed report are included. */
  sections: ReportSections;
  setSections: (value: ReportSections) => void;
  /**
   * An export is already running.
   *
   * Building a PDF takes long enough that the button itself has to say so. It
   * used to raise a full-screen splash for this, which was worse than the wait:
   * the report the user was reading vanished and came back a moment later.
   */
  busy?: boolean;
}) {
  const pageSize = 10;
  const [reportPage, setReportPage] = useState(1);
  const selectedYearLabel =
    reportYearId === null
      ? academicYearLabel
      : (yearOptions.find((year) => year.id === reportYearId)?.name ??
        academicYearLabel);
  const selectedClassName =
    reportClassId === null
      ? "Semua kelas"
      : classLevels.find((level) => level.id === reportClassId)?.name ?? "Semua kelas";
  const monthLabel = reportMonth === 0 ? "Semua bulan" : longMonths[reportMonth - 1];
  const hasFilter =
    reportMonth !== 0 || reportClassId !== null || reportYearId !== null;
  const scopeLabel =
    reportClassId === null ? monthLabel : `${monthLabel} · ${selectedClassName}`;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(reportPage, totalPages);
  const visibleTransactions = rows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const total = rows.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const average = rows.length ? Math.round(total / rows.length) : 0;
  return (
    <>
      <section className="report-summary">
        <article className="panel report-total">
          <span>Total penerimaan tercatat</span>
          <strong>
            {money(total)}
          </strong>
          <small>
            <ArrowUpRight size={14} /> {hasFilter ? scopeLabel : "Seluruh periode"}
          </small>
        </article>
        <article className="panel report-total">
          <span>Jumlah transaksi</span>
          <strong>{String(rows.length).padStart(2, "0")}</strong>
          <small>{hasFilter ? `Sesuai filter ${scopeLabel}` : "Transaksi tahun ajaran ini"}</small>
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
            <p>Daftar transaksi tahun ajaran {selectedYearLabel}</p>
          </div>
          <div className="toolbar-controls">
            <select
              className="filter-select"
              aria-label="Filter tahun ajaran"
              value={reportYearId ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                setReportYearId(raw === "" ? null : Number(raw));
                setReportPage(1);
              }}
            >
              <option value="">Tahun ajaran aktif</option>
              {yearOptions.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              aria-label="Filter bulan"
              value={reportMonth}
              onChange={(event) => {
                setReportMonth(Number(event.target.value));
                setReportPage(1);
              }}
            >
              <option value={0}>Semua bulan</option>
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              aria-label="Filter kelas"
              value={reportClassId ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                setReportClassId(raw === "" ? null : Number(raw));
                setReportPage(1);
              }}
            >
              <option value="">Semua kelas</option>
              {classLevels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
            </select>
            <button
              className="button button-primary"
              onClick={() => void onExport("pdf", rows, selectedClassName, monthLabel, sections)}
              disabled={busy || loading}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Download size={16} />
              )}
              Unduh PDF
            </button>
            <button
              className="button button-outline"
              title="Berkas Excel (.xlsx) — kolom rapi di semua komputer"
              onClick={() => void onExport("xlsx", rows, selectedClassName, monthLabel, sections)}
              disabled={busy || loading}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Sheet size={16} />
              )}
              Ekspor Excel
            </button>
            <button
              className="button button-outline"
              onClick={() => void onExport("print", rows, selectedClassName, monthLabel, sections)}
              disabled={busy || loading}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Printer size={16} />
              )}
              Print
            </button>
            <button
              className="button button-outline"
              title="CSV untuk sistem lain. Separator mengikuti Excel, bisa berbeda di komputer lain."
              onClick={() => void onExport("csv", rows, selectedClassName, monthLabel, sections)}
              disabled={busy || loading}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <FileSpreadsheet size={16} />
              )}
              Ekspor CSV
            </button>
          </div>
        </div>
        <div className="report-section-picker">
            <span className="report-section-label">Isi cetak:</span>
            {SECTION_OPTIONS.map((option) => (
              <label key={option.key} className="report-section-option">
                <input
                  type="checkbox"
                  checked={sections[option.key]}
                  onChange={(event) =>
                    setSections({ ...sections, [option.key]: event.target.checked })
                  }
                />
                {option.label}
              </label>
            ))}
            <button
              type="button"
              className="report-section-all"
              onClick={() =>
                setSections({
                  payments: true,
                  billStatus: true,
                  arrears: true,
                })
              }
              disabled={sections.payments && sections.billStatus && sections.arrears}
            >
              Pilih semua
            </button>
          </div>
        <div className="report-filter-strip">
          <span>
            <CalendarDays size={15} /> Tahun ajaran:{" "}
            <strong>{selectedYearLabel}</strong>
          </span>
          <span>
            <SlidersHorizontal size={15} /> Periode:{" "}
            <strong>{monthLabel}</strong>
          </span>
          <span>
            <SlidersHorizontal size={15} /> Kelas:{" "}
            <strong>{selectedClassName}</strong>
          </span>
          <span className="report-record-count">
            {rows.length} transaksi sesuai filter
          </span>
        </div>
        {loadError && <p className="form-error">{loadError}</p>}
        {truncated && (
          <p className="form-error">
            Laporan ini melebihi batas baris server dan hanya menampilkan bagian
            terbaru. Persempit filter bulan atau kelas agar angka lengkap.
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NO. TRANSAKSI</th>
                <th>NAMA SISWA</th>
                <th>KELAS</th>
                <th>RINCIAN</th>
                <th>TANGGAL</th>
                <th>JUMLAH</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((item, index) => (
                <tr key={`${item.id}-${index}`}>
                  <td>
                    <span className="id-cell">{item.id}</span>
                  </td>
                  <td>
                    <strong>{item.student}</strong>
                  </td>
                  <td className="muted-cell">{item.className ?? "-"}</td>
                  <td>{item.detail}</td>
                  <td className="muted-cell">{item.date}</td>
                  <td className="amount-cell">{money(item.amount)}</td>
                  <td>
                    <span className="status-pill">
                      <i /> {item.status}
                    </span>
                  </td>
                </tr>
              ))}
              {visibleTransactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-empty">
                    {loading
                      ? "Memuat laporan..."
                      : "Tidak ada transaksi untuk filter ini."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>
            {rows.length === 0 ? (
              "Menampilkan 0 transaksi"
            ) : (
              <>
                Menampilkan{" "}
                <strong>
                  {(currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, rows.length)}
                </strong>{" "}
                dari <strong>{rows.length}</strong> transaksi
              </>
            )}
          </span>
          <div>
            <button
              type="button"
              className="icon-button"
              aria-label="Halaman laporan sebelumnya"
              disabled={currentPage <= 1}
              onClick={() => setReportPage((page) => Math.max(1, page - 1))}
            >
              <ChevronLeft size={15} />
            </button>
            <span className="page-number" aria-current="page">{currentPage}</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Halaman laporan berikutnya"
              disabled={currentPage >= totalPages}
              onClick={() => setReportPage((page) => Math.min(totalPages, page + 1))}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

export default ReportsPage;
