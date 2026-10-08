import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchSchoolLogoDataUrl } from "./api";

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