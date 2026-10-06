import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

type ReportStudent = {
  name: string;
  className: string;
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

export async function downloadPaymentReport({
  school,
  user,
  transactions,
  students,
  classFilter,
  mode = "download",
}: {
  school: ReportSchool;
  user: ReportUser;
  transactions: ReportTransaction[];
  students: ReportStudent[];
  classFilter: string;
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
  const logo = await convertLogoToPng(school.logo);
  const initials = school.school
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

  if (logo) {
    pdf.addImage(logo, "PNG", margin, 12, 23, 23, undefined, "FAST");
  } else {
    pdf.setFillColor(36, 99, 78);
    pdf.roundedRect(margin, 12, 23, 23, 2, 2, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(initials || "SD", margin + 11.5, 26, { align: "center" });
  }

  const headerCenter = pageWidth / 2 + 7;
  pdf.setTextColor(35, 48, 40);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(school.foundation.toLocaleUpperCase("id-ID"), headerCenter, 15, {
    align: "center",
    maxWidth: pageWidth - 63,
  });
  pdf.setFontSize(13);
  pdf.text(school.school.toLocaleUpperCase("id-ID"), headerCenter, 22, {
    align: "center",
    maxWidth: pageWidth - 63,
  });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(school.address, headerCenter, 28, {
    align: "center",
    maxWidth: pageWidth - 63,
  });
  pdf.text([school.phone, school.email].filter(Boolean).join(" · "), headerCenter, 33, {
    align: "center",
    maxWidth: pageWidth - 63,
  });
  pdf.setDrawColor(43, 56, 48);
  pdf.setLineWidth(0.65);
  pdf.line(margin, 39, pageWidth - margin, 39);
  pdf.setLineWidth(0.2);
  pdf.line(margin, 41, pageWidth - margin, 41);

  pdf.setTextColor(34, 47, 39);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text("LAPORAN PEMBAYARAN SEKOLAH", pageWidth / 2, 51, {
    align: "center",
  });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("Tahun ajaran 2026 / 2027", pageWidth / 2, 57, { align: "center" });
  pdf.setFontSize(8);
  pdf.text(`Tingkat kelas: ${classFilter}`, margin, 68);
  pdf.text(`Dicetak pada: ${printedAt(now)}`, margin, 73);
  pdf.text(`Jumlah transaksi: ${transactions.length}`, pageWidth - margin, 73, {
    align: "right",
  });

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
    startY: 78,
    head: [["No.", "Kode transaksi", "Siswa", "Kelas", "Rincian pembayaran", "Jumlah", "Status", "Tanggal"]],
    body: body.length ? body : [["-", "-", "Tidak ada transaksi", "-", "-", "-", "-", "-"]],
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

  const tableEnd = (pdf as jsPDF & { lastAutoTable?: { finalY: number } })
    .lastAutoTable?.finalY ?? 80;
  let signY = tableEnd + 13;
  if (signY + 31 > pageHeight - 8) {
    pdf.addPage();
    signY = 20;
  }

  const place = school.address.split(",").slice(-2).join(",").trim();
  const dateText = now.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const right = pageWidth - margin;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`${place}, ${dateText}`, right, signY, { align: "right" });
  pdf.text(user.role === "pimpinan" ? "Pimpinan Sekolah" : "Petugas Keuangan", right, signY + 8, {
    align: "right",
  });
  pdf.setFont("helvetica", "bold");
  pdf.text(user.name, right, signY + 26, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("NIP. ____________________", right, signY + 31, { align: "right" });

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