import { ArrowUpRight, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import type { Student } from "../types";
import { money } from "../lib/format";
import { studentSppAmount } from "../lib/students";



export function StudentsPage({
  students,
  sppAmounts,
  classLevels,
  search,
  setSearch,
  onPay,
  onAdd,
}: {
  students: Student[];
  sppAmounts: number[];
  classLevels: string[];
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
                      studentSppAmount(student, sppAmounts, classLevels),
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

export default StudentsPage;
