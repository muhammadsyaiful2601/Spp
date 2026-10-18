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

/**
 * Time-of-day greeting.
 *
 * The four boundaries follow Indonesian usage rather than an evenly divided
 * day: `sore` is the short stretch before sunset, while `malam` has to cover
 * both the evening proper and the small hours — a treasurer opening the portal
 * at 02.00 is not being wished a good morning. `pagi` starts at 04.00 because
 * anything earlier is still night.
 */
export function greetingPart(now: Date) {
  const hour = now.getHours();

  if (hour >= 4 && hour < 11) return "pagi";
  if (hour >= 11 && hour < 15) return "siang";
  if (hour >= 15 && hour < 18) return "sore";
  return "malam";
}

export function money(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
