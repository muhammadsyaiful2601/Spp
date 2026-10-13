import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchSchoolLogoDataUrl } from "./api";
import { printStudentReportPage } from "./studentPrint";
import type { Profile, Student, Transaction } from "./types";

type ReportStudent = {
  name: string;
  className: string;
  paid: number[];
  sppArrears: number;
  sppUnpaidCount: number;
  sppTotalCount: number;
};

type ReportTransaction = {
  id: string;
  student: string;
  detail: string;
  date: string;
  amount: number;
  status: string;
  /** Class level, as reported by the server for this row. */
  className?: string;
};

type ReportSchool = {
  school: string;
  foundation: string;
  address: string;
  phone: string;
  email: string;
  logo: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
};

type ReportUser = {
  name: string;
  role: "pimpinan" | "admin";
  /** Employee number, printed under the signature. */
  nip?: string | null;
};

/**
 * Which parts of the report to print.
 *
 * A treasurer printing a receipt trail does not want a page of arrears, and one
 * chasing unpaid bills does not need every transaction. Splitting them is only
 * honest because each part now states its own scope on the page.
 */
export type ReportSections = {
  /** Payment transactions for the filtered period. */
  payments: boolean;
  /** Per-student SPP bill status for the whole year. */
  billStatus: boolean;
  /** Students who still owe, with the amount. */
  arrears: boolean;
};

const ALL_SECTIONS: ReportSections = {
  payments: true,
  billStatus: true,
  arrears: true,
};

/** Fixed bank account printed on reports, or null while any part is missing. */
type BankAccount = {
  name: string;
  number: string;
  holder: string;
};

function bankAccountOf(school: {
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
}): BankAccount | null {
  const name = school.bankName?.trim() ?? "";
  const number = school.bankAccountNumber?.trim() ?? "";
  const holder = school.bankAccountHolder?.trim() ?? "";
  return name && number && holder ? { name, number, holder } : null;
}

/**
 * One-paragraph payment instruction. Kept short because it sits under the
 * header on a report whose body is a table — a long account block would push
 * the first data rows down the page.
 */
function bankAccountText(account: BankAccount): string {
  return `Pembayaran melalui transfer bank ${account.name} No. ${account.number} a.n. ${account.holder}.`;
}

async function convertLogoToPng(source: string): Promise<string | null> {
  if (!source) return null;

  return new Promise((resolve) => {
    const image = new Image();
    if (!source.startsWith("data:")) image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d")?.drawImage(image, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function printedAt(date: Date): string {
  return `${date.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" })} ${date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

function rupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function titleCaseWords(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase("id-ID") + word.slice(1))
    .join(" ");
}

function compactAddress(address: string): string {
  return address
    .split(/[\n\r]+/)
    .flatMap((line) => line.split(","))
    .map((part) => titleCaseWords(part.trim()))
    .filter(Boolean)
    .join(", ");
}

function placeFromAddress(address: string): string {
  const parts = compactAddress(address)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const last = parts.at(-1) ?? "";
  return last && !/^[-–—\s.]*$/.test(last) ? last : "............";
}

function writeCenteredBlock(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  if (!text) return y;
  const lines = pdf.splitTextToSize(text, maxWidth);
  pdf.text(lines, x, y, { align: "center" });
  return y + lines.length * lineHeight;
}

function writeRightLines(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const lines = pdf.splitTextToSize(text, maxWidth);
  lines.forEach((line: string, index: number) => {
    pdf.text(line, x, y + index * lineHeight, { align: "right" });
  });
  return y + lines.length * lineHeight;
}

/** `NIP. <number>` when known, the blank rule otherwise. */
function nipLine(nip?: string | null): string {
  const value = nip?.trim();
  return value ? `NIP. ${value}` : "NIP. ..............................";
}

function drawSignatureBlock(
  pdf: jsPDF,
  {
    pageWidth,
    pageHeight,
    margin,
    startY,
    roleLabel,
    signerName,
    place,
    dateText,
    nip,
  }: {
    pageWidth: number;
    pageHeight: number;
    margin: number;
    startY: number;
    roleLabel: string;
    signerName: string;
    /** Employee number of the signer; omitted when the account has none. */
    nip?: string | null;
    place: string;
    dateText: string;
  },
): void {
  let signY = startY;
  if (signY + 44 > pageHeight - 8) {
    pdf.addPage();
    signY = 20;
  }

  const showSignerName =
    Boolean(signerName) &&
    signerName.toLocaleLowerCase("id-ID") !== roleLabel.toLocaleLowerCase("id-ID");
  const right = pageWidth - margin;
  const boxWidth = 78;
  const boxLeft = right - boxWidth;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  let blockY = writeRightLines(
    pdf,
    `${place}, ${dateText}`,
    right,
    signY,
    boxWidth,
    4.4,
  );
  blockY = writeRightLines(pdf, roleLabel, right, blockY + 1, boxWidth, 4.4);

  const lineAt = blockY + 22;
  pdf.setDrawColor(120, 130, 122);
  pdf.setLineWidth(0.3);
  pdf.line(boxLeft, lineAt, right, lineAt);

  if (showSignerName) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    writeRightLines(pdf, signerName, right, lineAt + 5, boxWidth, 4.2);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    // The account's own NIP when it has one, otherwise the blank rule that was
    // always there. Printing "NIP. ……" next to a real number would look wrong,
    // and printing nothing at all would drop a field the reader expects.
    pdf.text(nipLine(nip), right, lineAt + 10, { align: "right" });
  } else {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(nipLine(nip), right, lineAt + 5, { align: "right" });
  }
}

export async function downloadPaymentReport({
  school,
  user,
  transactions,
  students,
  classFilter,
  monthFilter,
  academicYearLabel,
  mode = "download",
  sections,
}: {
  school: ReportSchool;
  user: ReportUser;
  transactions: ReportTransaction[];
  students: ReportStudent[];
  classFilter: string;
  /** Label of the active month filter, e.g. "Januari"; "Semua bulan" for none. */
  monthFilter: string;
  academicYearLabel: string;
  /**
   * `download` menyimpan berkas PDF, `print` membukanya di tab baru lalu
   * memicu dialog cetak browser secara otomatis.
   */
  mode?: "download" | "print";
  /** Subset of the report to include; everything when omitted. */
  sections?: ReportSections;
}): Promise<void> {
  // An empty selection would produce a cover page and nothing else, which is
  // never what the user meant. Fall back to the payment list.
  const wants = sections ?? ALL_SECTIONS;
  const show = {
    ...wants,
    payments: wants.payments || (!wants.billStatus && !wants.arrears),
  };

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const now = new Date();
  const logoSource = await fetchSchoolLogoDataUrl();
  const logo = await convertLogoToPng(logoSource ?? "");
  const institutionName = (school.foundation.trim() || school.school.trim()).toLocaleUpperCase(
    "id-ID",
  );
  const initials = institutionName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");

  const pageCenter = pageWidth / 2;
  const logoSize = 26;
  const logoX = margin;
  const kopTop = 10;
  const kopMaxWidth = pageWidth - (margin + logoSize + 6) * 2;
  const addressText = compactAddress(school.address);
  const contactText = [
    school.phone.trim() && `Telp. ${school.phone.trim()}`,
    school.email.trim() && `Email: ${school.email.trim()}`,
  ]
    .filter(Boolean)
    .join("  ·  ");

  let cursorY = kopTop + 7;
  pdf.setTextColor(20, 32, 26);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  cursorY = writeCenteredBlock(pdf, institutionName, pageCenter, cursorY, kopMaxWidth, 6.4);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  if (addressText) {
    cursorY += 0.6;
    cursorY = writeCenteredBlock(
      pdf,
      `Alamat: ${addressText}`,
      pageCenter,
      cursorY,
      kopMaxWidth,
      4.2,
    );
  }
  if (contactText) {
    cursorY = writeCenteredBlock(pdf, contactText, pageCenter, cursorY, kopMaxWidth, 4);
  }

  const kopBottom = cursorY + 1.2;
  const logoY = kopTop + Math.max(0, (kopBottom - kopTop - logoSize) / 2);
  if (logo) {
    pdf.addImage(logo, "PNG", logoX, logoY, logoSize, logoSize, undefined, "FAST");
  } else {
    pdf.setFillColor(36, 99, 78);
    pdf.roundedRect(logoX, logoY, logoSize, logoSize, 2, 2, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text(initials || "SD", logoX + logoSize / 2, logoY + logoSize / 2 + 3.5, {
      align: "center",
    });
  }

  const lineY = Math.max(logoY + logoSize, kopBottom) + 3;
  pdf.setDrawColor(28, 42, 34);
  pdf.setLineWidth(0.85);
  pdf.line(margin, lineY, pageWidth - margin, lineY);
  pdf.setLineWidth(0.28);
  pdf.line(margin, lineY + 1.6, pageWidth - margin, lineY + 1.6);

  pdf.setTextColor(20, 32, 26);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text("LAPORAN PEMBAYARAN SEKOLAH", pageCenter, lineY + 9, {
    align: "center",
  });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.text(`Tahun Ajaran ${academicYearLabel}`, pageCenter, lineY + 14.5, {
    align: "center",
  });

  pdf.setFontSize(8);
  pdf.setTextColor(45, 56, 48);
  pdf.text(`Tingkat kelas: ${classFilter}  ·  Periode: ${monthFilter}`, margin, lineY + 22.5);
  pdf.text(
    show.payments
      ? `Dicetak: ${printedAt(now)}  ·  ${transactions.length} transaksi`
      : `Dicetak: ${printedAt(now)}`,
    pageWidth - margin,
    lineY + 22.5,
    { align: "right" },
  );

  // Payment instruction sits above the table, so the account is on the page
  // before anyone reads a single figure.
  let tableStart = lineY + 27;
  const bankAccount = bankAccountOf(school);
  if (bankAccount) {
    pdf.setFontSize(7.5);
    pdf.setTextColor(45, 56, 48);
    tableStart = writeCenteredBlock(
      pdf,
      bankAccountText(bankAccount),
      pageCenter,
      lineY + 27.5,
      pageWidth - margin * 2,
      4,
    ) + 3;
  }

  const filteredStudents = students.filter(
    (student) => classFilter === "Semua kelas" || student.className === classFilter,
  );
// Where the recap ends, so the signature can follow it. `null` when the recap
  // itself was not printed.
  let recapEnd: number | null = null;
  const totalPaid = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalArrears = filteredStudents.reduce((sum, student) => sum + student.sppArrears, 0);
  const payingCount = filteredStudents.filter((student) => student.paid.length > 0).length;
  const arrearsCount = filteredStudents.filter((student) => student.sppUnpaidCount > 0).length;
  const lunasCount = filteredStudents.length - arrearsCount;

  const studentByName = new Map(students.map((student) => [student.name, student]));
  const body = transactions.map((transaction, index) => {
    // Prefer the class carried by the report row itself. Matching the student
    // roster by name is only a fallback: two students can share a name, and a
    // report is a financial document, so the class has to come from the row the
    // server built rather than from a name match.
    const student = studentByName.get(transaction.student);

    return [
      String(index + 1),
      transaction.id,
      student?.name ?? transaction.student,
      transaction.className ?? student?.className ?? "-",
      transaction.detail,
      rupiah(transaction.amount),
      transaction.status,
      transaction.date,
    ];
  });

  if (show.payments) {
    autoTable(pdf, {
      startY: tableStart,
      head: [["No.", "Kode transaksi", "Siswa", "Kelas", "Rincian pembayaran", "Jumlah", "Status transaksi", "Tanggal"]],
    body: body.length ? body : [["-", "-", "Tidak ada transaksi", "-", "-", "-", "-", "-"]],
    foot: [
      [
        {
          content: `Total yang membayar (${transactions.length} transaksi)`,
          colSpan: 5,
          styles: { halign: "right", fontStyle: "bold" },
        },
        { content: rupiah(totalPaid), styles: { halign: "right", fontStyle: "bold" } },
        { content: "", colSpan: 2 },
      ],
    ],
    margin: { left: margin, right: margin, bottom: 34 },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 2.2,
      textColor: [43, 53, 46],
      lineColor: [93, 104, 96],
      lineWidth: 0.18,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [222, 230, 239],
      textColor: [35, 48, 40],
      fontStyle: "bold",
      halign: "center",
    },
    footStyles: {
      fillColor: [241, 245, 241],
      textColor: [35, 48, 40],
      fontStyle: "bold",
    },
    showFoot: "lastPage",
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 24 },
      2: { cellWidth: 30 },
      3: { cellWidth: 18 },
      4: { cellWidth: 31 },
      5: { cellWidth: 23, halign: "right" },
      6: { cellWidth: 18 },
      7: { cellWidth: 22 },
    },
  });
  }

  // Only start a new page when something already used page one. With the payment
  // list switched off, page one would otherwise hold nothing but the letterhead
  // and the report would waste a sheet of paper saying nothing.
  let nextSectionY = 20;
  if (show.billStatus || show.arrears) {
    if (show.payments) {
      pdf.addPage();
    } else {
      nextSectionY = tableStart + 4;
    }
  }

  if (show.billStatus) {
    pdf.setTextColor(34, 47, 39);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("STATUS TAGIHAN SPP SISWA", margin, nextSectionY);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    // Spell out the full scope. The bill-status table is a whole-year view of the
    // SPP bills, so saying "semua bulan" here is honest: it deliberately does not
    // narrow to one month the way the payment list above it does.
    pdf.text(
      `Tahun ajaran ${academicYearLabel} · Tingkat kelas: ${classFilter} · Status tagihan SPP untuk seluruh bulan tahun ajaran`,
      margin,
      nextSectionY + 6,
    );
    const billStatusRows = filteredStudents.map((student, index) => {
      const paidCount = student.paid.length;
      const unpaidCount = student.sppUnpaidCount;
      const status = student.sppTotalCount === 0
        ? "Tarif belum diatur"
        : unpaidCount === 0
          ? "Lunas"
          : paidCount === 0
            ? "Menunggak"
            : "Sebagian";

      // Arrears money and the "bulan belum bayar" count live in their own section.
      // Repeating them here made the two sections say the same thing twice, and
      // left the reader unsure which one was authoritative.
      return [
        String(index + 1),
        student.name,
        student.className,
        `${paidCount} / ${student.sppTotalCount}`,
        status,
      ];
    });

    autoTable(pdf, {
    startY: nextSectionY + 11,
    head: [["No.", "Siswa", "Kelas", "Bulan lunas", "Status"]],
    body: billStatusRows.length
      ? billStatusRows
      : [["-", "Tidak ada data siswa", "-", "-", "-"]],
    foot: [
      [
        {
          content: `Lunas ${lunasCount} siswa · Belum lunas ${arrearsCount} siswa`,
          colSpan: 4,
          styles: { halign: "right", fontStyle: "bold" },
        },
        { content: "", styles: {} },
      ],
    ],
    margin: { left: margin, right: margin, bottom: 34 },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [43, 53, 46],
      lineColor: [93, 104, 96],
      lineWidth: 0.18,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [222, 230, 239],
      textColor: [35, 48, 40],
      fontStyle: "bold",
      halign: "center",
    },
    footStyles: {
      fillColor: [241, 245, 241],
      textColor: [35, 48, 40],
      fontStyle: "bold",
    },
    showFoot: "lastPage",
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 60 },
      2: { cellWidth: 24 },
      3: { cellWidth: 28, halign: "center" },
      4: { cellWidth: 40, halign: "center" },
    },
  });
  }

if (show.arrears) {
    // Follow the bill-status table on the same page when it left room, so a
    // report of two short sections does not become two near-empty sheets.
    let arrearsY = nextSectionY;
    if (show.billStatus) {
      const finalY = (pdf as jsPDF & { lastAutoTable?: { finalY: number } })
        .lastAutoTable?.finalY;
      if (typeof finalY === "number") {
        arrearsY = finalY + 14;
      }
    }
    if (arrearsY + 40 > pageHeight - 20) {
      pdf.addPage();
      arrearsY = 20;
    }

    pdf.setTextColor(34, 47, 39);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("RINCIAN TUNGGAKAN SPP", margin, arrearsY);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(
      `Tahun ajaran ${academicYearLabel} · Tingkat kelas: ${classFilter} · Bulan SPP yang belum dibayar (seluruh tahun ajaran)`,
      margin,
      arrearsY + 6,
    );
    const arrearsRows = filteredStudents
      .filter((student) => (student.sppUnpaidCount ?? 0) > 0)
      .map((student, index) => [
        String(index + 1),
        student.name,
        student.className,
        String(student.sppUnpaidCount),
        rupiah(student.sppArrears),
      ]);
    autoTable(pdf, {
      startY: arrearsY + 11,
      head: [["No.", "Siswa", "Kelas", "Bulan belum bayar", "Nominal tunggakan"]],
      body: arrearsRows.length
        ? arrearsRows
        : [["-", "Tidak ada tunggakan", "-", "-", "-"]],
      foot: [
        [
          {
            content: `Total tunggakan (${arrearsRows.length} siswa)`,
            colSpan: 4,
            styles: { halign: "right", fontStyle: "bold" },
          },
          { content: rupiah(totalArrears), styles: { halign: "right", fontStyle: "bold" } },
        ],
      ],
      margin: { left: margin, right: margin, bottom: 34 },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 2.5,
        textColor: [43, 53, 46],
        lineColor: [93, 104, 96],
        lineWidth: 0.18,
        overflow: "linebreak",
        valign: "middle",
      },
      headStyles: {
        fillColor: [222, 230, 239],
        textColor: [35, 48, 40],
        fontStyle: "bold",
        halign: "center",
      },
      footStyles: {
        fillColor: [241, 245, 241],
        textColor: [35, 48, 40],
        fontStyle: "bold",
      },
      showFoot: "lastPage",
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 60 },
        2: { cellWidth: 24 },
        3: { cellWidth: 34, halign: "center" },
        4: { cellWidth: 40, halign: "right" },
      },
    });
  }

  if (show.payments || show.arrears) {
    const tableEnd = (pdf as jsPDF & { lastAutoTable?: { finalY: number } })
      .lastAutoTable?.finalY ?? 80;
    let recapY = tableEnd + 10;
    if (recapY + 28 > pageHeight - 48) {
      pdf.addPage();
      recapY = 20;
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(34, 47, 39);
    // Scope is spelled out because the first line is filtered by period while the
    // arrears below it is a whole-year figure. Mixing them under one bare heading
    // would let a reader subtract one from the other and get a wrong answer.
    pdf.text(
      `RINGKASAN — ${monthFilter === "Semua bulan" ? "seluruh periode" : monthFilter} · ${classFilter}`,
      margin,
      recapY,
    );
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    if (show.payments) {
      pdf.text(
        `Total yang membayar (periode ini): ${rupiah(totalPaid)} · ${transactions.length} transaksi · ${payingCount} siswa pernah membayar`,
        margin,
        recapY + 6,
      );
    }
    if (show.arrears) {
      pdf.text(
        `Total yang menunggak (seluruh tagihan tahun ajaran, bukan periode ini): ${rupiah(totalArrears)} · ${arrearsCount} siswa masih memiliki tunggakan SPP`,
        margin,
        recapY + (show.payments ? 11 : 6),
      );
    }
    recapEnd = recapY + (show.payments && show.arrears ? 24 : 12);
  }

  // The signature block is always printed: a report without it is not a document
  // anyone can file.
  //
  // Its position must follow whatever was actually drawn last. Anchoring it to a
  // fixed offset instead made it land in the middle of a long bill-status table
  // whenever the recap was skipped — printing the signer's details straight over
  // rows 174-180 of it.
  // If it will not fit on the current page the block moves to a fresh one. The
  // helper below repeats this check, so this only avoids handing it a start
  // position that is already known to overflow.
  const lastDrawn = (pdf as jsPDF & { lastAutoTable?: { finalY: number } })
    .lastAutoTable?.finalY;
  const signY = Math.max(recapEnd ?? 0, lastDrawn ?? 0) + 14;

  drawSignatureBlock(pdf, {
    pageWidth,
    pageHeight,
    margin,
    startY: signY,
    roleLabel: user.role === "pimpinan" ? "Pimpinan Sekolah" : "Petugas Keuangan",
    signerName: user.name.trim(),
    nip: user.nip,
    place: placeFromAddress(school.address),
    dateText: now.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  });

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(115, 126, 117);
    pdf.text(`${page} / ${pages}`, pageWidth - margin, pageHeight - 7, {
      align: "right",
    });
  }

  // The filename carries the scope so exports of different years or classes do
  // not overwrite each other in the downloads folder.
  const filename = `laporan-pembayaran-${academicYearLabel.replace(/[^0-9]+/g, "-")}-${classFilter.replace(/[^0-9A-Za-z]+/g, "-")}-${now.toISOString().slice(0, 10)}.pdf`;

  if (mode === "print") {
    // `autoPrint` puts a print action inside the PDF, and the browser's own PDF
    // viewer runs it as soon as the file loads. A blob URL is used rather than
    // jsPDF's `dataurlnewwindow`, because browsers block top-level navigation to
    // a `data:` URL — that path silently opens nothing at all on Chrome.
    pdf.autoPrint();
    const url = pdf.output("bloburl");
    window.open(url, "_blank");

    return;
  }

  pdf.save(filename);
}

export async function downloadStudentReport({
  school,
  student,
  transactions,
  academicYearLabel,
  mode = "download",
  printWindow,
  user,
}: {
  school: Profile;
  student: Student;
  transactions: Transaction[];
  academicYearLabel: string;
  mode?: "download" | "print";
  printWindow?: Window | null;
  user?: ReportUser | null;
}): Promise<void> {
  if (mode === "print") {
    if (!printWindow) {
      throw new Error("Jendela cetak tidak dapat dibuka oleh browser.");
    }
    const studentTransactions = transactions.filter(
      (transaction) => transaction.student === student.name,
    );
    const logoDataUrl = await fetchSchoolLogoDataUrl();
    printStudentReportPage({
      printWindow,
      school,
      student,
      transactions: studentTransactions,
      academicYearLabel,
      printedTime: printedAt(new Date()),
      logoDataUrl,
      user,
    });
    return;
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 16;
  const now = new Date();
  const logoSource = await fetchSchoolLogoDataUrl();
  const logo = await convertLogoToPng(logoSource ?? "");
  const institutionName = (school.foundation.trim() || school.school.trim())
    .toLocaleUpperCase("id-ID");
  const initials = institutionName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  const contactText = [
    school.phone.trim() && `Telp. ${school.phone.trim()}`,
    school.email.trim() && `Email: ${school.email.trim()}`,
  ].filter(Boolean).join("  ·  ");
  const logoSize = 24;
  const textCenter = pageWidth / 2;
  const headerWidth = pageWidth - (margin + logoSize + 8) * 2;
  let headerY = 16;

  pdf.setTextColor(20, 32, 26);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  headerY = writeCenteredBlock(pdf, institutionName, textCenter, headerY, headerWidth, 6);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  const address = compactAddress(school.address);
  if (address) {
    headerY = writeCenteredBlock(pdf, `Alamat: ${address}`, textCenter, headerY, headerWidth, 4);
  }
  if (contactText) {
    headerY = writeCenteredBlock(pdf, contactText, textCenter, headerY, headerWidth, 4);
  }

  const logoY = Math.max(12, headerY / 2 - logoSize / 2);
  if (logo) {
    pdf.addImage(logo, "PNG", margin, logoY, logoSize, logoSize, undefined, "FAST");
  } else {
    pdf.setFillColor(36, 99, 78);
    pdf.roundedRect(margin, logoY, logoSize, logoSize, 2, 2, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(initials || "SD", margin + logoSize / 2, logoY + logoSize / 2 + 3, {
      align: "center",
    });
  }

  const headerBottom = Math.max(headerY + 2, logoY + logoSize);
  pdf.setDrawColor(28, 42, 34);
  pdf.setLineWidth(0.8);
  pdf.line(margin, headerBottom + 3, pageWidth - margin, headerBottom + 3);
  pdf.setLineWidth(0.25);
  pdf.line(margin, headerBottom + 4.5, pageWidth - margin, headerBottom + 4.5);

  const titleY = headerBottom + 13;
  pdf.setTextColor(20, 32, 26);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text("LAPORAN PEMBAYARAN SISWA", textCenter, titleY, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`Tahun Ajaran ${academicYearLabel}`, textCenter, titleY + 6, { align: "center" });

  const studentTransactions = transactions
    .filter((transaction) => transaction.student === student.name)
    .slice();
  const totalPaid = studentTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const sppArrears = student.sppArrears ?? 0;
  const nonSppArrears = student.nonSppArrears ?? 0;
  const totalArrears = sppArrears + nonSppArrears;

  let infoY = titleY + 15;
  const studentBank = bankAccountOf(school);
  if (studentBank) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(45, 56, 48);
    infoY = writeCenteredBlock(
      pdf,
      bankAccountText(studentBank),
      textCenter,
      titleY + 14,
      pageWidth - margin * 2,
      4,
    ) + 6;
  }

  pdf.setFontSize(9);
  pdf.setTextColor(20, 32, 26);
  pdf.setFont("helvetica", "bold");
  pdf.text("IDENTITAS SISWA", margin, infoY);
  autoTable(pdf, {
    startY: infoY + 3,
    body: [
      ["Nama siswa", student.name, "Kelas", student.className],
      ["NIS", student.id, "NISN", student.nisn || "-"],
    ],
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 3,
      textColor: [43, 53, 46],
      lineColor: [180, 190, 182],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 27, fontStyle: "bold", fillColor: [241, 245, 241] },
      1: { cellWidth: 58 },
      2: { cellWidth: 22, fontStyle: "bold", fillColor: [241, 245, 241] },
      3: { cellWidth: "auto" },
    },
  });

  const identityEnd = (pdf as jsPDF & { lastAutoTable?: { finalY: number } })
    .lastAutoTable?.finalY ?? infoY + 25;
  const summaryY = identityEnd + 10;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("RINGKASAN PEMBAYARAN", margin, summaryY);
  autoTable(pdf, {
    startY: summaryY + 3,
    head: [["Keterangan", "Jumlah"]],
    body: [
      ["Total pembayaran tercatat", rupiah(totalPaid)],
      ["Tunggakan SPP", rupiah(sppArrears)],
      ["Tunggakan biaya lainnya", rupiah(nonSppArrears)],
      ["Sisa seluruh tagihan", rupiah(totalArrears)],
      ["Bulan SPP lunas", `${student.paid.length} dari ${student.sppTotalCount ?? 12} bulan`],
    ],
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 3,
      textColor: [43, 53, 46],
      lineColor: [180, 190, 182],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [222, 230, 239],
      textColor: [35, 48, 40],
      fontStyle: "bold",
    },
    columnStyles: { 1: { halign: "right", cellWidth: 55 } },
  });

  const summaryEnd = (pdf as jsPDF & { lastAutoTable?: { finalY: number } })
    .lastAutoTable?.finalY ?? summaryY + 35;
  const historyY = summaryEnd + 10;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("RIWAYAT TRANSAKSI", margin, historyY);
  autoTable(pdf, {
    startY: historyY + 3,
    head: [["No.", "No. transaksi", "Rincian pembayaran", "Tanggal", "Jumlah", "Status"]],
    body: studentTransactions.length
      ? studentTransactions.map((transaction, index) => [
          String(index + 1),
          transaction.id,
          transaction.detail,
          transaction.date,
          rupiah(transaction.amount),
          transaction.status,
        ])
      : [["-", "-", "Belum ada transaksi pembayaran", "-", "-", "-"]],
    foot: [[
      { content: "Total pembayaran", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
      { content: rupiah(totalPaid), styles: { halign: "right", fontStyle: "bold" } },
      { content: "" },
    ]],
    margin: { left: margin, right: margin, bottom: 25 },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [43, 53, 46],
      lineColor: [93, 104, 96],
      lineWidth: 0.18,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [222, 230, 239],
      textColor: [35, 48, 40],
      fontStyle: "bold",
      halign: "center",
    },
    footStyles: {
      fillColor: [241, 245, 241],
      textColor: [35, 48, 40],
      fontStyle: "bold",
    },
    showFoot: "lastPage",
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 28 },
      2: { cellWidth: 48 },
      3: { cellWidth: 32 },
      4: { cellWidth: 32, halign: "right" },
      5: { cellWidth: "auto", halign: "center" },
    },
  });

  const historyEnd =
    (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
  drawSignatureBlock(pdf, {
    pageWidth,
    pageHeight,
    margin,
    startY: historyEnd + 12,
    roleLabel: user?.role === "pimpinan" ? "Pimpinan Sekolah" : "Petugas Keuangan",
    signerName: user?.name?.trim() ?? "",
    nip: user?.nip,
    place: placeFromAddress(school.address),
    dateText: now.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  });

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(115, 126, 117);
    pdf.text(
      `Dicetak ${printedAt(now)} · ${page} / ${pages}`,
      pageWidth - margin,
      pageHeight - 7,
      { align: "right" },
    );
  }

  const safeStudentId = student.id.replace(/[^a-zA-Z0-9-_]/g, "-");
  const filename = `laporan-siswa-${safeStudentId}-${now.toISOString().slice(0, 10)}.pdf`;
  pdf.save(filename);
}
