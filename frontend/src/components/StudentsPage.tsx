import { useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Printer,
  Search,
} from "lucide-react";
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
  onReport,
  onAdd,
  reportBusy,
}: {
  students: Student[];
  sppAmounts: number[];
  classLevels: string[];
  search: string;
  setSearch: (value: string) => void;
  onPay: (student: Student) => void;
  onReport: (
    student: Student,
    mode: "download" | "print",
    printWindow?: Window | null,
  ) => void;
  onAdd: () => void;
  reportBusy: boolean;
}) {
  const pageSize = 10;
  const [studentPage, setStudentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(students.length / pageSize));
  const currentPage = Math.min(studentPage, totalPages);
  const visibleStudents = students.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

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
              onChange={(event) => {
                setSearch(event.target.value);
                setStudentPage(1);
              }}
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
              <th>SISA SEMUA TAGIHAN</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleStudents.map((student, index) => (
              <tr key={student.id}>
                <td>
                  <div className="table-person">
                    <div className={`student-avatar avatar-${((currentPage - 1) * pageSize + index) % 4}`}>
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
                    (student.sppArrears ??
                      (12 - student.paid.length) *
                        studentSppAmount(student, sppAmounts, classLevels)) +
                      (student.nonSppArrears ?? 0),
                  )}
                </td>
                <td>
                  <div className="toolbar-controls">
                    <button
                      className="button button-table"
                      onClick={() => onPay(student)}
                    >
                      Bayar <ArrowUpRight size={14} />
                    </button>
                    <button
                      className="button button-table"
                      aria-label={`Unduh laporan ${student.name}`}
                      title="Unduh laporan PDF"
                      disabled={reportBusy}
                      onClick={() => onReport(student, "download")}
                    >
                      <Download size={14} />
                    </button>
                    <button
                      className="button button-table"
                      aria-label={`Cetak laporan ${student.name}`}
                      title="Cetak laporan"
                      disabled={reportBusy}
                      onClick={() =>
                        onReport(student, "print", window.open("about:blank", "_blank"))
                      }
                    >
                      <Printer size={14} />
                    </button>
                  </div>
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
          {students.length === 0
            ? "Menampilkan 0 data siswa"
            : <>Menampilkan <strong>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, students.length)}</strong> dari <strong>{students.length}</strong> data siswa</>}
        </span>
        <div>
          <button
            className="icon-button"
            aria-label="Halaman sebelumnya"
            disabled={currentPage <= 1}
            onClick={() => setStudentPage((page) => Math.max(1, page - 1))}
          >
            <ChevronLeft size={17} />
          </button>
          <span className="page-number" aria-current="page">{currentPage}</span>
          <button
            className="icon-button"
            aria-label="Halaman berikutnya"
            disabled={currentPage >= totalPages}
            onClick={() => setStudentPage((page) => Math.min(totalPages, page + 1))}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
    </section>
  );
}

export default StudentsPage;
