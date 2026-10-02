import type { Profile, Student, Transaction } from "./types";

export const months = [
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
];
export const monthNames = [
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
];
// Students, transactions, tariffs and school identity are loaded from the
// database via `GET /api/v1/data/portal` and `GET /api/v1/public/sekolah-profile`.
// Nothing is hard-coded here: a fresh install starts empty and the school fills
// in its own details from the "Profil sekolah" screen.
export const initialStudents: Student[] = [];
export const initialTransactions: Transaction[] = [];
export const initialProfile: Profile = {
  school: "",
  foundation: "",
  address: "",
  phone: "",
  email: "",
  note: "",
  logo: "",
  favicon: "",
  themePrimary: "#24634e",
  themeAccent: "#c88942",
};

export const initialSppRates: number[] = [];
