import {
  ArrowUpRight,
  CalendarDays,
  Download,
  FileSpreadsheet,
  Loader2,
  Printer,
  SlidersHorizontal,
} from "lucide-react";
import type { Student, Transaction } from "../types";
import { money } from "../lib/format";



export function ReportsPage({
  transactions,
  students,
  classLevels,
  reportClass,
  setReportClass,
  onExport,
  busy = false,
}: {
  transactions: Transaction[];
  students: Student[];
  classLevels: string[];
  reportClass: string;
  setReportClass: (value: string) => void;
  onExport: (
    format: "csv" | "pdf" | "print",
    reportTransactions: Transaction[],
    classFilter: string,
  ) => Promise<void>;
  /**
   * An export is already running.
   *
   * Building a PDF takes long enough that the button itself has to say so. It
   * used to raise a full-screen splash for this, which was worse than the wait:
   * the report the user was reading vanished and came back a moment later.
   */
  busy?: boolean;
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
              {classLevels.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <button
              className="button button-outline"
              onClick={() => void onExport("csv", filteredTransactions, reportClass)}
              disabled={busy}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <FileSpreadsheet size={16} />
              )}
              Ekspor CSV
            </button>
            <button
              className="button button-outline"
              onClick={() => void onExport("print", filteredTransactions, reportClass)}
              disabled={busy}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Printer size={16} />
              )}
              Print
            </button>
            <button
              className="button button-primary"
              onClick={() => void onExport("pdf", filteredTransactions, reportClass)}
              disabled={busy}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Download size={16} />
              )}
              Unduh PDF
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

export default ReportsPage;
