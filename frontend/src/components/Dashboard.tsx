import { ArrowRight, ArrowUpRight, Banknote, BookOpenCheck, ChevronDown, CircleDollarSign, ReceiptText, Users, Wallet } from "lucide-react";
import type { Page, Student, Transaction } from "../types";
import { money } from "../lib/format";
import { months } from "../constants";



export function Dashboard({
  students,
  transactions,
  totalPaid,
  outstanding,
  monthlyRevenue,
  onGo,
  onReceipt,
}: {
  students: Student[];
  transactions: Transaction[];
  totalPaid: number;
  outstanding: number;
  monthlyRevenue: number[];
  onGo: (page: Page) => void;
  onReceipt: (item: Transaction) => void;
}) {
  // Bars are scaled against the best month so real rupiah values render as heights.
  const peak = Math.max(...monthlyRevenue, 1);
  const revenue = monthlyRevenue.map((amount) =>
    amount > 0 ? Math.max(4, Math.round((amount / peak) * 100)) : 2,
  );
  const averagePaid = students.length
    ? Math.round(
        (students.reduce((sum, student) => sum + student.paid.length, 0) /
          (students.length * 12)) *
          100,
      )
    : 0;
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
            <strong>{money(monthlyRevenue.reduce((sum, value) => sum + value, 0))}</strong>
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
                  <span>{money(monthlyRevenue[index] ?? 0)}</span>
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

export default Dashboard;
