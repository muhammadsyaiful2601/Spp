import {
  AlertTriangle,
  Check,
  Clock,
  Users,
  Wallet,
} from "lucide-react";
import type { Notice, Student, Transaction } from "../types";
import { money } from "./format";
import { studentSppAmount } from "./students";

/** Icon component for each notice kind, rendered by the notification panel. */
export const noticeIconMap = {
  wallet: Wallet,
  alert: AlertTriangle,
  users: Users,
  check: Check,
  clock: Clock,
} as const;

/**
 * Derive the notification list from real portal data: outstanding SPP per
 * student plus the most recent payments. No hard-coded entries.
 */
export function buildNotices(
  students: Student[],
  transactions: Transaction[],
  rates: number[],
  levels: string[],
): Notice[] {
  const items: Notice[] = [];
  const arrears = students
    .map((student) => {
      const unpaid = Math.max(0, 12 - student.paid.length);
      return {
        student,
        unpaid,
        amount: unpaid * studentSppAmount(student, rates, levels),
      };
    })
    .filter((row) => row.unpaid > 0)
    .sort((a, b) => b.unpaid - a.unpaid);

  const totalArrears = arrears.reduce((sum, row) => sum + row.amount, 0);
  if (arrears.length > 0) {
    items.push({
      id: "notice-arrears-total",
      tone: "amber",
      icon: "alert",
      title: `${arrears.length} siswa menunggak SPP`,
      body: `Total tunggakan ${money(totalArrears)} belum tertagih.`,
      time: "Perlu ditindaklanjuti",
      target: "siswa",
    });
  }
  arrears.slice(0, 3).forEach((row) => {
    items.push({
      id: `notice-arrears-${row.student.id}`,
      tone: "coral",
      icon: "users",
      title: `${row.student.name} belum lunas`,
      body: `${row.unpaid} bulan SPP · ${row.student.className} · ${money(row.amount)}`,
      time: "Tunggakan SPP",
      target: "siswa",
    });
  });

  transactions.slice(0, 3).forEach((transaction) => {
    items.push({
      id: `notice-trx-${transaction.id}`,
      tone: "green",
      icon: "wallet",
      title: `Pembayaran ${money(transaction.amount)} diterima`,
      body: `${transaction.student} · ${transaction.detail}`,
      time: transaction.date.startsWith("Hari ini")
        ? "Hari ini"
        : (transaction.date.split(",")[0] ?? transaction.date),
      target: "laporan",
    });
  });

  const today = new Date();
  if (today.getDate() === 1 || items.length === 0) {
    items.unshift({
      id: "notice-period-open",
      tone: "blue",
      icon: "clock",
      title: "Periode tagihan baru dibuka",
      body: "Pastikan seluruh tagihan bulan berjalan sudah masuk dan siap ditagih.",
      time: "Info sistem",
      target: "pembayaran",
    });
  }

  return items.slice(0, 7);
}
