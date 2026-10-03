/**
 * Shared domain types for the school finance portal.
 * Kept in one place so pages and hooks never redefine them.
 */

export type Page =
  | "dashboard"
  | "siswa"
  | "pembayaran"
  | "laporan"
  | "pengaturan"
  | "profil"
  | "bendahara"
  | "log"
  | "akun";

export type Student = {
  id: string;
  name: string;
  className: string;
  paid: number[];
  nisn: string;
  dbId?: number;
};

export type Transaction = {
  id: string;
  student: string;
  detail: string;
  date: string;
  amount: number;
  status: string;
};

export type Profile = {
  school: string;
  foundation: string;
  address: string;
  phone: string;
  email: string;
  note: string;
  logo: string;
  favicon: string;
  themePrimary: string;
  themeAccent: string;
};

export type NoticeTone = "amber" | "green" | "blue" | "coral";

export type Notice = {
  id: string;
  tone: NoticeTone;
  icon: "wallet" | "alert" | "users" | "check" | "clock";
  title: string;
  body: string;
  time: string;
  target: Page;
};

/** Which overlay dialog is currently open. */
export type ModalKind = "payment" | "student" | "receipt" | null;

/** Non-SPP fee position with its per-class amount. */
export type Cost = { name: string; type: string; amount: number };
