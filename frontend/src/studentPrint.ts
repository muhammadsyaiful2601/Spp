import type { Profile, Student, Transaction } from "./types";

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

function rupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function compactAddress(address: string): string {
  return address
    .split(/[\n\r]+/)
    .flatMap((line) => line.split(","))
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

export function printStudentReportPage({
  printWindow,
  school,
  student,
  transactions,
  academicYearLabel,
  printedTime,
  logoDataUrl,
}: {
  printWindow: Window;
  school: Profile;
  student: Student;
  transactions: Transaction[];
  academicYearLabel: string;
  printedTime: string;
  /** Data URL logo sekolah (base64). Jika tidak diberikan, fallback ke inisial. */
  logoDataUrl?: string | null;
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
  
  // Gunakan logoDataUrl (base64) agar logo bisa tampil di window print baru
  // tanpa bergantung pada CORS atau session cookie.
  const resolvedLogoSrc = logoDataUrl ?? school.logo;
  const logo = resolvedLogoSrc
    ? `<img class="logo" src="${escapeHtml(resolvedLogoSrc)}" alt="Logo sekolah">`
    : "";
  
  const address = compactAddress(school.address);
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
              <p>${escapeHtml(address)}</p>
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
  printWindow.print();
}
