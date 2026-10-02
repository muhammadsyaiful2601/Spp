export const dayNames = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
export const longMonths = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function formatToday(now: Date) {
  const long = `${dayNames[now.getDay()]}, ${now.getDate()} ${longMonths[now.getMonth()]} ${now.getFullYear()}`;
  return {
    long,
    upper: long.toUpperCase(),
    short: `${now.getDate()} ${longMonths[now.getMonth()]} ${now.getFullYear()}`,
    clock: `${String(now.getHours()).padStart(2, "0")}.${String(now.getMinutes()).padStart(2, "0")}`,
  };
}

export function money(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
