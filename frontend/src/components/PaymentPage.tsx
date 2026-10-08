import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CircleDollarSign, Plus, ReceiptText, Search, ShieldCheck } from "lucide-react";
import type { Student } from "../types";
import type { AcademicYear } from "../api";
import { money } from "../lib/format";
import { studentSppAmount } from "../lib/students";
import { monthNames } from "../constants";
import { fetchStudentBills } from "../api";



export function PaymentPage({
  students,
  sppAmounts,
  classLevels,
  search,
  setSearch,
  onPay,
  academicYears,
  selectedYearId,
  onSelectYear,
}: {
  students: Student[];
  sppAmounts: number[];
  classLevels: string[];
  search: string;
  setSearch: (value: string) => void;
  onPay: (student: Student, kind?: "spp" | "non-spp") => void;
  academicYears: AcademicYear[];
  selectedYearId: number | null;
  onSelectYear: (yearId: number) => void;
}) {
  const pageSize = 10;
  const [studentPage, setStudentPage] = useState(1);
  const [selected, setSelected] = useState<Student | null>(null);
  const totalPages = Math.max(1, Math.ceil(students.length / pageSize));
  const currentPage = Math.min(studentPage, totalPages);
  const visibleStudents = students.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const selectedStudent = students.find((student) => student.id === selected?.id) ?? null;
  const year = academicYears.find((item) => item.id === selectedYearId)
    ?? academicYears.find((item) => item.is_active)
    ?? null;
  const billsQuery = useQuery({
    queryKey: ["student-bills", selectedStudent?.dbId, selectedYearId],
    queryFn: () => fetchStudentBills(selectedStudent!.dbId!, selectedYearId),
    enabled: selectedStudent?.dbId !== undefined,
  });
  const sppBills = billsQuery.data?.spp;
  const paidMonthIndexes = sppBills
    ? sppBills.filter((bill) => bill.status === "lunas")
      .map((bill) => bill.month >= 7 ? bill.month - 7 : bill.month + 5)
    : selectedStudent?.paid ?? [];
  const monthlyAmount = (monthIndex: number) => {
    if (!selectedStudent) return 0;
    const month = monthIndex < 6 ? monthIndex + 7 : monthIndex - 5;
    const bill = sppBills?.find((item) => item.month === month);
    return bill
      ? Number(bill.amount)
      : studentSppAmount(selectedStudent, sppAmounts, classLevels);
  };
  const unpaidSppAmount = monthNames.reduce((total, _month, monthIndex) => (
    paidMonthIndexes.includes(monthIndex)
      ? total
      : total + monthlyAmount(monthIndex)
  ), 0);
  const hasUnpaidNonSpp = billsQuery.data?.non_spp.some(
    (bill) => Number(bill.amount_due) > Number(bill.amount_paid),
  ) ?? false;

  return (
    <div className="payment-layout">
      <section className="panel payment-search-panel">
        <div className="panel-heading">
          <div>
            <h2>Cari siswa</h2>
            <p>Pilih siswa untuk melihat tagihan tahun ajaran.</p>
          </div>
          <div className="payment-year-select">
            <label htmlFor="payment-academic-year">Tahun ajaran</label>
            <select
              id="payment-academic-year"
              value={selectedYearId ?? year?.id ?? ""}
              onChange={(event) => onSelectYear(Number(event.target.value))}
              disabled={academicYears.length === 0}
            >
              {academicYears.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}{item.is_active ? " · Aktif" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="search-box payment-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setStudentPage(1);
            }}
            placeholder="Nama, NIS, atau NISN"
          />
        </label>
        <div className="student-results">
          {visibleStudents.map((student, index) => (
            <button
              key={student.id}
              className={`student-result ${selected?.id === student.id ? "chosen" : ""}`}
              onClick={() => setSelected(student)}
            >
              <div className={`student-avatar avatar-${((currentPage - 1) * pageSize + index) % 4}`}>
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
          {students.length === 0 && (
            <div className="payment-student-empty">
              Siswa tidak ditemukan. Coba kata kunci lain.
            </div>
          )}
        </div>
        <div className="payment-student-pagination" aria-label="Navigasi halaman siswa">
          <span>
            {students.length === 0
              ? "0 data siswa"
              : `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, students.length)} dari ${students.length} siswa`}
          </span>
          <div>
            <button
              type="button"
              className="icon-button"
              aria-label="Halaman siswa sebelumnya"
              disabled={currentPage <= 1}
              onClick={() => setStudentPage((page) => Math.max(1, page - 1))}
            >
              <ChevronLeft size={15} />
            </button>
            <span className="page-number" aria-current="page">{currentPage}</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Halaman siswa berikutnya"
              disabled={currentPage >= totalPages}
              onClick={() => setStudentPage((page) => Math.min(totalPages, page + 1))}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </section>
      {selectedStudent ? (
        <section className="panel billing-panel">
          <div className="billing-header">
            <div>
              <span className="eyebrow">RINCIAN TAGIHAN</span>
              <h2>{selectedStudent.name}</h2>
              <p>
                {selectedStudent.id} · {selectedStudent.className} · {year?.name ?? "Tahun ajaran aktif"}
              </p>
            </div>
            <button
              className="button button-primary"
              onClick={() => onPay(selectedStudent)}
              disabled={billsQuery.isLoading}
            >
              <Plus size={16} /> Catat pembayaran
            </button>
          </div>
          <div className="billing-summary">
            <div>
              <span>Total tunggakan SPP</span>
              <strong>
                {money(unpaidSppAmount)}
              </strong>
            </div>
            <div>
              <span>Bulan belum dibayar</span>
              <strong>
                {12 - paidMonthIndexes.length} <small>bulan</small>
              </strong>
            </div>
            {billsQuery.data && hasUnpaidNonSpp && (
              <button
                className="button button-outline"
                onClick={() => onPay(selectedStudent, "non-spp")}
                disabled={billsQuery.isLoading}
              >
                <CircleDollarSign size={16} /> Bayar biaya lain
              </button>
            )}
          </div>
          <h3 className="subsection-title">
            Tagihan SPP <span>{year?.name ?? "Tahun ajaran aktif"}</span>
          </h3>
          {billsQuery.isError && (
            <div className="payment-bills-error" role="alert">
              Tagihan periode ini gagal dimuat. Silakan coba lagi.
              <button type="button" onClick={() => void billsQuery.refetch()}>Muat ulang</button>
            </div>
          )}
          <div className="bill-months">
            {monthNames.map((month, index) => (
              <div
                key={month}
                className={`bill-month ${paidMonthIndexes.includes(index) ? "paid" : "unpaid"}`}
              >
                <span>{month}</span>
                <strong>
                  {paidMonthIndexes.includes(index) ? "Lunas" : "Belum bayar"}
                </strong>
                <small>{money(monthlyAmount(index))}</small>
              </div>
            ))}
          </div>
          <h3 className="subsection-title">
            Biaya lainnya <span>{year?.name ?? "Tahun ajaran aktif"}</span>
          </h3>
          {billsQuery.data?.non_spp.length ? (
            <div className="historical-cost-list">
              {billsQuery.data.non_spp.map((bill) => (
                <div className="historical-cost-row" key={bill.id}>
                  <span>
                    <strong>{bill.position}</strong>
                    <small>{bill.status === "lunas" ? "Lunas" : bill.status === "sebagian" ? "Cicilan" : "Belum dibayar"}</small>
                  </span>
                  <strong>{money(Math.max(0, Number(bill.amount_due) - Number(bill.amount_paid)))}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="historical-cost-empty">
              {billsQuery.isLoading ? "Memuat tagihan biaya lain..." : "Belum ada tagihan biaya lain pada tahun ajaran ini."}
            </p>
          )}
          <div className="billing-note">
            <ShieldCheck size={16} />
            <span>
              Tarif mengikuti pengaturan SPP kelas{" "}
              {selectedStudent.className.replace("Kelas ", "")} pada tahun ajaran terpilih.
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

export default PaymentPage;
