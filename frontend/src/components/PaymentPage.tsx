import { useState } from "react";
import { ChevronRight, CircleDollarSign, Plus, ReceiptText, Search, ShieldCheck } from "lucide-react";
import type { Student } from "../types";
import { money } from "../lib/format";
import { studentSppAmount } from "../lib/students";
import { monthNames } from "../constants";



export function PaymentPage({
  students,
  sppAmounts,
  classLevels,
  search,
  setSearch,
  onPay,
}: {
  students: Student[];
  sppAmounts: number[];
  classLevels: string[];
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
                    studentSppAmount(selected, sppAmounts, classLevels),
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
                <small>{money(studentSppAmount(selected, sppAmounts, classLevels))}</small>
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

export default PaymentPage;
