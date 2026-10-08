import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchSchoolLogoDataUrl } from "./api";
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
};

type ReportSchool = {
  school: string;
  foundation: string;
  address: string;
  phone: string;
  email: string;
  logo: string;
};

type ReportUser = {
  name: string;
  role: "pimpinan" | "admin";
};

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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function printStudentReportPage({
  printWindow,
  school,
  student,
  transactions,
  academicYearLabel,
  printedTime,
}: {
  printWindow: Window;
  school: Profile;
  student: Student;
  transactions: Transaction[];
  academicYearLabel: string;
  printedTime: string;
}): void {
  const totalPaid = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const sppArrears = student.sppArrears ?? 0;
  const nonSppArrears = student.nonSppArrears ?? 0;
  const historyRows = transactions.length
    ? transactions.map((transaction, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(transaction.id)}</td>
          <td>${escapeHtml(transaction.detail)}</td>
          <td>${escapeHtml(transaction.date)}</td>
          <td class="amount">${escapeHtml(rupiah(transaction.amount))}</td>
          <td>${escapeHtml(transaction.status)}</td>
        </tr>`).join("")
    : '<tr><td colspan="6" class="empty">Belum ada transaksi pembayaran</td></tr>';
  const logo = school.logo
    ? `<img class="logo" src="${escapeHtml(school.logo)}" alt="Logo sekolah">`
    : "";
  const contact = [
    school.phone.trim() && `Telp. ${school.phone.trim()}`,
    school.email.trim() && `Email: ${school.email.trim()}`,
  ].filter(Boolean).map(escapeHtml).join(" · ");

  printWindow.opener = null;
  printWindow.focus();
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html lang="id">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Laporan siswa - ${escapeHtml(student.name)}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 28px; color: #202820; font: 13px Arial, sans-serif; }
          main { max-width: 900px; margin: 0 auto; }
          header { display: flex; align-items: center; gap: 18px; padding-bottom: 14px; border-bottom: 3px double #26392c; }
          .logo { width: 72px; height: 72px; object-fit: contain; }
          .school { flex: 1; text-align: center; }
          h1 { margin: 0 0 6px; font-size: 20px; }
          .school p { margin: 3px 0; color: #475249; font-size: 11px; }
          h2 { margin: 24px 0 9px; font-size: 14px; }
          .report-title { margin: 20px 0 4px; text-align: center; font-size: 18px; }
          .year { margin: 0; text-align: center; color: #475249; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #aab4ac; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #e8eee9; }
          .amount { text-align: right; white-space: nowrap; }
          .empty { padding: 16px; text-align: center; color: #68736a; }
          .printed { margin-top: 22px; text-align: right; color: #68736a; font-size: 10px; }
          @media print {
            body { padding: 0; font-size: 11px; }
            header { break-inside: avoid; }
            h2 { break-after: avoid; }
            tr { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <main>
          <header>
            ${logo}
            <div class="school">
              <h1>${escapeHtml(school.foundation.trim() || school.school.trim())}</h1>
              <p>${escapeHtml(compactAddress(school.address))}</p>
              <p>${contact}</p>
            </div>
            ${logo}
          </header>
          <h2 class="report-title">LAPORAN PEMBAYARAN SISWA</h2>
          <p class="year">Tahun Ajaran ${escapeHtml(academicYearLabel)}</p>
          <h2>Identitas Siswa</h2>
          <table>
            <tbody>
              <tr><th>Nama siswa</th><td>${escapeHtml(student.name)}</td><th>Kelas</th><td>${escapeHtml(student.className)}</td></tr>
              <tr><th>NIS</th><td>${escapeHtml(student.id)}</td><th>NISN</th><td>${escapeHtml(student.nisn || "-")}</td></tr>
            </tbody>
          </table>
          <h2>Ringkasan Pembayaran</h2>
          <table>
            <thead><tr><th>Keterangan</th><th>Jumlah</th></tr></thead>
            <tbody>
              <tr><td>Total pembayaran tercatat</td><td class="amount">${escapeHtml(rupiah(totalPaid))}</td></tr>
              <tr><td>Tunggakan SPP</td><td class="amount">${escapeHtml(rupiah(sppArrears))}</td></tr>
              <tr><td>Tunggakan biaya lainnya</td><td class="amount">${escapeHtml(rupiah(nonSppArrears))}</td></tr>
              <tr><td>Sisa seluruh tagihan</td><td class="amount">${escapeHtml(rupiah(sppArrears + nonSppArrears))}</td></tr>
              <tr><td>Bulan SPP lunas</td><td>${student.paid.length} dari ${student.sppTotalCount ?? 12} bulan</td></tr>
            </tbody>
          </table>
          <h2>Riwayat Transaksi</h2>
          <table>
            <thead><tr><th>No.</th><th>No. transaksi</th><th>Rincian pembayaran</th><th>Tanggal</th><th>Jumlah</th><th>Status</th></tr></thead>
            <tbody>${historyRows}</tbody>
            <tfoot><tr><th colspan="4" class="amount">Total pembayaran</th><th class="amount">${escapeHtml(rupiah(totalPaid))}</th><th></th></tr></tfoot>
          </table>
          <p class="printed">Dicetak: ${escapeHtml(printedTime)}</p>
        </main>
      </body>
    </html>`);
  printWindow.document.close();
  window.setTimeout(() => printWindow.print(), 500);
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

export async function downloadPaymentReport({
  school,
  user,
  transactions,
  students,
  classFilter,
  academicYearLabel,
  mode = "download",
}: {
  school: ReportSchool;
  user: ReportUser;
  transactions: ReportTransaction[];
  students: ReportStudent[];
  classFilter: string;
  academicYearLabel: string;
  /**
   * `download` menyimpan berkas PDF, `print` membukanya di tab baru lalu
   * memicu dialog cetak browser secara otomatis.
   */
  mode?: "download" | "print";
}): Promise<void> {
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
  pdf.text(`Tingkat kelas: ${classFilter}`, margin, lineY + 22.5);
  pdf.text(
    `Dicetak: ${printedAt(now)}  ·  ${transactions.length} transaksi`,
    pageWidth - margin,
    lineY + 22.5,
    { align: "right" },
  );

  const filteredStudents = students.filter(
    (student) => classFilter === "Semua kelas" || student.className === classFilter,
  );
  const totalPaid = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalArrears = filteredStudents.reduce((sum, student) => sum + student.sppArrears, 0);
  const payingCount = filteredStudents.filter((student) => student.paid.length > 0).length;
  const arrearsCount = filteredStudents.filter((student) => student.sppUnpaidCount > 0).length;

  const studentByName = new Map(students.map((student) => [student.name, student]));
  const body = transactions.map((transaction, index) => {
    const student = studentByName.get(transaction.student);

    return [
      String(index + 1),
      transaction.id,
      student?.name ?? transaction.student,
      student?.className ?? "-",
      transaction.detail,
      rupiah(transaction.amount),
      transaction.status,
      transaction.date,
    ];
  });

  autoTable(pdf, {
    startY: lineY + 27,
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

  pdf.addPage();
  pdf.setTextColor(34, 47, 39);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("STATUS TAGIHAN SPP SISWA", margin, 20);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(`Tahun ajaran ${academicYearLabel} · Tingkat kelas: ${classFilter}`, margin, 26);
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

      return [
        String(index + 1),
        student.name,
        student.className,
        `${paidCount} / ${student.sppTotalCount}`,
        String(unpaidCount),
        rupiah(student.sppArrears),
        status,
      ];
    });
  autoTable(pdf, {
    startY: 31,
    head: [["No.", "Siswa", "Kelas", "Bulan lunas", "Tunggakan", "Nominal tunggakan", "Status"]],
    body: billStatusRows.length
      ? billStatusRows
      : [["-", "Tidak ada data siswa", "-", "-", "-", "-", "-"]],
    foot: [
      [
        {
          content: `Total yang menunggak (${arrearsCount} siswa)`,
          colSpan: 5,
          styles: { halign: "right", fontStyle: "bold" },
        },
        { content: rupiah(totalArrears), styles: { halign: "right", fontStyle: "bold" } },
        { content: "" },
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
      1: { cellWidth: 44 },
      2: { cellWidth: 22 },
      3: { cellWidth: 23, halign: "center" },
      4: { cellWidth: 20, halign: "center" },
      5: { cellWidth: 34, halign: "right" },
      6: { cellWidth: 29, halign: "center" },
    },
  });

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
  pdf.text("RINGKASAN TOTAL", margin, recapY);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(
    `Total yang membayar: ${rupiah(totalPaid)} · ${transactions.length} transaksi · ${payingCount} siswa pernah membayar`,
    margin,
    recapY + 6,
  );
  pdf.text(
    `Total yang menunggak: ${rupiah(totalArrears)} · ${arrearsCount} siswa masih memiliki tunggakan SPP`,
    margin,
    recapY + 11,
  );

  let signY = recapY + 24;
  if (signY + 44 > pageHeight - 8) {
    pdf.addPage();
    signY = 20;
  }

  const roleLabel = user.role === "pimpinan" ? "Pimpinan Sekolah" : "Petugas Keuangan";
  const signerName = user.name.trim();
  const showSignerName =
    Boolean(signerName) &&
    signerName.toLocaleLowerCase("id-ID") !== roleLabel.toLocaleLowerCase("id-ID");
  const dateText = now.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const right = pageWidth - margin;
  const boxWidth = 78;
  const boxLeft = right - boxWidth;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  let blockY = writeRightLines(
    pdf,
    `${placeFromAddress(school.address)}, ${dateText}`,
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
    pdf.text("NIP. ..............................", right, lineAt + 10, { align: "right" });
  } else {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text("NIP. ..............................", right, lineAt + 5, { align: "right" });
  }

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

  const filename = `laporan-pembayaran-${now.toISOString().slice(0, 10)}.pdf`;

  if (mode === "print") {
    // autoPrint + tab baru agar dialog cetak browser langsung terbuka.
    pdf.autoPrint();
    pdf.output("dataurlnewwindow", { filename });

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
}: {
  school: Profile;
  student: Student;
  transactions: Transaction[];
  academicYearLabel: string;
  mode?: "download" | "print";
  printWindow?: Window | null;
}): Promise<void> {
  if (mode === "print") {
    if (!printWindow) {
      throw new Error("Jendela cetak tidak dapat dibuka oleh browser.");
    }
    const studentTransactions = transactions.filter(
      (transaction) => transaction.student === student.name,
    );
    printStudentReportPage({
      printWindow,
      school,
      student,
      transactions: studentTransactions,
      academicYearLabel,
      printedTime: printedAt(new Date()),
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
  const infoY = titleY + 15;

  pdf.setFontSize(9);
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