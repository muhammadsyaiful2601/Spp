import type { Row, SheetData } from "write-excel-file/browser";
import type { Transaction } from "./types";

/**
 * Spreadsheet export for the payment report.
 *
 * Two formats, for two different reasons:
 *
 * - **CSV** is a plain text interchange format with no way to describe a table.
 *   Excel decides how to split columns using the *local* list separator, so a
 *   comma-delimited file lands in a single column wherever that separator is a
 *   semicolon, and the whole report looks empty. It also reads UTF-8 as
 *   Windows-1252 without a byte-order mark, turning "·" into "Â·". Neither is
 *   fixable from the file side alone, which is why CSV stays available but is
 *   no longer the recommended format.
 * - **XLSX** is a real spreadsheet format: column count, widths, number format
 *   and styling travel inside the file, so it renders identically on every
 *   machine regardless of regional settings.
 */

type ExportRow = (string | number)[];

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking in the same tick can cancel the download before the browser has
  // read the blob; give it a moment to start.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Column separator for the CSV.
 *
 * Excel does not use the separator from RFC 4180. It splits a text file using
 * the *local* list separator configured in Windows, and on machines where that
 * is a semicolon a comma-delimited file lands entirely in column A with every
 * quote still visible — which is exactly the symptom of an unreadable export.
 * A semicolon is the separator Excel defaults to outside the few locales that
 * use a comma, and this report's text never contains one, so it is the safer
 * default. `.xlsx` remains the only format that is immune to this entirely.
 */
const CSV_SEPARATOR = ";";

/** True when the value would be read as something other than literal text. */
function needsQuoting(value: string): boolean {
  return (
    value.includes(CSV_SEPARATOR) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r") ||
    value !== value.trim()
  );
}

/**
 * Quote a cell only when it has to be quoted.
 *
 * Blanket-quoting every cell is what makes a CSV look tidy in a text editor
 * and useless in Excel: a quoted `400000` is stored as text, so the column
 * cannot be summed, sorted numerically, or filtered. Leaving plain numbers bare
 * lets Excel treat them as numbers.
 */
function escapeCsvCell(value: string | number): string {
  if (typeof value === "number") return String(value);

  // A leading =, +, - or @ makes Excel treat the cell as a formula. Student
  // names and fee labels are user input, so a crafted name would otherwise run
  // as a formula on whoever opens the export.
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

  return needsQuoting(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

/**
 * Serialise rows to CSV.
 *
 * The BOM is not decoration: without it Excel assumes the system codepage and
 * mangles every non-ASCII character, which is why "·" and any Indonesian text
 * arrive as mojibake. Lines end in CRLF because that is what RFC 4180 defines
 * and what Excel's parser reliably splits on.
 */
export function buildCsv(rows: ExportRow[]): string {
  return rows
    .map((row) => row.map(escapeCsvCell).join(CSV_SEPARATOR))
    .join("\r\n");
}

export type ReportMeta = {
  school: string;
  academicYearLabel: string;
  classFilter: string;
  monthFilter: string;
  printedAt: string;
};

/** Column layout shared by both formats, so CSV and XLSX stay in step. */
const COLUMNS = [
  { header: "No. Transaksi", width: 26 },
  { header: "Nama Siswa", width: 26 },
  { header: "Kelas", width: 14 },
  { header: "Rincian", width: 34 },
  { header: "Tanggal", width: 20 },
  { header: "Jumlah", width: 18 },
  { header: "Status", width: 12 },
];

export function downloadReportCsv(
  transactions: Transaction[],
  meta: ReportMeta,
  filename: string,
): void {
  const rows: ExportRow[] = [
    [meta.school],
    [`Tahun Ajaran ${meta.academicYearLabel}`],
    [`Kelas: ${meta.classFilter} · Periode: ${meta.monthFilter}`],
    [`Dicetak: ${meta.printedAt}`],
    [],
    COLUMNS.map((column) => column.header),
    ...transactions.map((item) => [
      item.id,
      item.student,
      item.className ?? "",
      item.detail,
      item.date,
      item.amount,
      item.status,
    ]),
    [],
    ["", "", "", "", "TOTAL", ""],
    [
      "",
      "",
      "",
      "",
      transactions.reduce((sum, item) => sum + item.amount, 0),
      "",
    ],
  ];
  // Amount stays a raw number so spreadsheets can sum and sort it; formatting
  // belongs to the cell, not to the value.
  download(
    new Blob(["﻿", buildCsv(rows)], { type: "text/csv;charset=utf-8" }),
    filename,
  );
}

function metaRows(meta: ReportMeta): SheetData {
  return [
    [{ value: meta.school, fontWeight: "bold" as const, fontSize: 13 }],
    [`Tahun Ajaran ${meta.academicYearLabel}`],
    [`Kelas: ${meta.classFilter} · Periode: ${meta.monthFilter}`],
    [`Dicetak: ${meta.printedAt}`],
    [],
  ];
}

/**
 * Border set applied to every cell of the table.
 *
 * CSV cannot carry any of this: a comma-separated file is plain text, so grid
 * lines, colours and alignment simply do not exist as concepts in the format.
 * Everything visual about the layout has to live in the workbook.
 */
const BORDER = {
  borderColor: "#c3cdc4",
  borderStyle: "thin" as const,
  topBorderColor: "#c3cdc4",
  topBorderStyle: "thin" as const,
  bottomBorderColor: "#c3cdc4",
  bottomBorderStyle: "thin" as const,
  leftBorderColor: "#c3cdc4",
  leftBorderStyle: "thin" as const,
  rightBorderColor: "#c3cdc4",
  rightBorderStyle: "thin" as const,
};

/**
 * Build a real workbook: a title block, a bordered header, the payments, and a
 * totals row, with the header frozen so scrolling a long year keeps the column
 * names in view.
 */
export async function downloadReportXlsx(
  transactions: Transaction[],
  meta: ReportMeta,
): Promise<void> {
  // The library has no root entry; a single-page app must take the browser
  // build, which streams the file straight to the download instead of going
  // through Node's filesystem.
  const { default: writeXlsxFile } = await import("write-excel-file/browser");

  const header: Row = COLUMNS.map((column) => ({
    value: column.header,
    fontWeight: "bold" as const,
    backgroundColor: "#e8eee9",
    alignVertical: "center" as const,
    ...BORDER,
  }));

  const body: Row[] = transactions.map((item) => [
    { value: item.id, ...BORDER },
    { value: item.student, ...BORDER },
    { value: item.className ?? "", ...BORDER },
    // Long fee descriptions get their own room instead of running into the
    // neighbouring column.
    { value: item.detail, wrap: true, alignVertical: "top" as const, ...BORDER },
    { value: item.date, ...BORDER },
    {
      // A real number cell, not a formatted string: Excel can then sum, sort
      // and filter the column, which a text amount silently prevents.
      value: item.amount,
      type: Number,
      format: '#,##0',
      align: "right" as const,
      ...BORDER,
    },
    { value: item.status, align: "center" as const, ...BORDER },
  ]);

  const totalsBorder = {
    ...BORDER,
    topBorderStyle: "double" as const,
    topBorderColor: "#5c6b60",
  };
  const totalRow: Row = [
    { value: "", ...BORDER },
    { value: "", ...BORDER },
    { value: "", ...BORDER },
    { value: "", ...BORDER },
    { value: "TOTAL", fontWeight: "bold" as const, align: "right" as const, ...totalsBorder },
    {
      value: transactions.reduce((sum, item) => sum + item.amount, 0),
      type: Number,
      format: '#,##0',
      fontWeight: "bold" as const,
      align: "right" as const,
      ...totalsBorder,
    },
    { value: "", ...BORDER },
  ];

  const sheet: SheetData = [...metaRows(meta), header, ...body, totalRow];

  await writeXlsxFile(sheet, {
    columns: COLUMNS.map((column) => ({ width: column.width })),
    // Keeps the header visible while scrolling a year of payments.
    stickyRowsCount: 6,
  });

  // The browser build names the download itself from the document title; there
  // is no file-name option to pass.
}