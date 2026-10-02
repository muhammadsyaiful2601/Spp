import type { Student } from "../types";

export function studentSppAmount(
  student: Student,
  rates: number[],
  levels: string[],
) {
  return rates[levels.indexOf(student.className)] ?? 0;
}
