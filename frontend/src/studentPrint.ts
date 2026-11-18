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

export function printStudentReportPage({
  printWindow,
  school,
  student,
  transactions,
  academicYearLabel,
  printedTime,
  logoDataUrl,
  user,
}: {
  printWindow: Window;
  school: Profile;
  student: Student;
  transactions: Transaction[];
  academicYearLabel: string;
  printedTime: string;
  /** Data URL logo sekolah (base64). Jika tidak diberikan, fallback ke logo profil. */
  logoDataUrl?: string | null;
  /** Penanda tangan laporan; memengaruhi label jabatan pada blok tanda tangan. */
  user?: { name: string; role: "pimpinan" | "admin"; nip?: string | null } | null;
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
  // Kop sekolah sama persis dengan laporan pembayaran sekolah: logo di kiri,
  // teks_instansi terpusat, dan kotak hijau berisi inisial bila logo kosong.
  const institutionName = (school.foundation.trim() || school.school.trim()).toLocaleUpperCase(
    "id-ID",
  );
  const initials = institutionName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  const logo = resolvedLogoSrc
    ? `<img class="logo" src="${escapeHtml(resolvedLogoSrc)}" alt="Logo sekolah">`
    : `<div class="logo logo-fallback">${escapeHtml(initials || "SD")}</div>`;

  const address = compactAddress(school.address);
  const contact = [
    school.phone.trim() && `Telp. ${school.phone.trim()}`,
    school.email.trim() && `Email: ${school.email.trim()}`,
  ].filter(Boolean).map(escapeHtml).join(" · ");
  const roleLabel = user?.role === "pimpinan" ? "Pimpinan Sekolah" : "Petugas Keuangan";
  const signerName = user?.name?.trim() ?? "";
  // Printed when the account has one; the blank rule is kept for anyone without.
  const nipValue = user?.nip?.trim() ?? "";
  const nipLine = nipValue
    ? `NIP. ${nipValue}`
    : "NIP. ..............................";
  const place = placeFromAddress(school.address);
  const signDate = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const hasBankAccount = Boolean(
    school.bankName.trim() &&
      school.bankAccountNumber.trim() &&
      school.bankAccountHolder.trim(),
  );
  const bankBlock = hasBankAccount
    ? `<div class="bank">
        <p class="bank-title">Pembayaran melalui transfer ke rekening berikut:</p>
        <table>
          <tbody>
            <tr><th>Nama bank</th><td>${escapeHtml(school.bankName.trim())}</td></tr>
            <tr><th>Nomor rekening</th><td>${escapeHtml(school.bankAccountNumber.trim())}</td></tr>
            <tr><th>Atas nama</th><td>${escapeHtml(school.bankAccountHolder.trim())}</td></tr>
          </tbody>
        </table>
      </div>`
    : "";

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
          header { display: flex; align-items: center; gap: 14px; padding-bottom: 12px; border-bottom: 3px double #26392c; }
          .logo { width: 72px; height: 72px; object-fit: contain; flex: 0 0 auto; }
          .logo-fallback { display: flex; align-items: center; justify-content: center; background: #24634e; color: #fff; font-size: 26px; font-weight: 700; border-radius: 6px; }
          .school { flex: 1; text-align: center; }
          h1 { margin: 0 0 6px; font-size: 20px; text-transform: uppercase; }
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
          .bank { margin: 18px 0 0; padding: 11px 13px; background: #f4f7f3; border: 1px solid #dfe7de; border-radius: 6px; }
          .bank-title { margin: 0 0 7px; color: #475249; font-size: 11px; }
          .bank table { width: 100%; }
          .bank th { width: 34%; background: transparent; font-weight: 700; }
          .signature { margin: 34px 0 0 auto; width: 260px; font-size: 12px; color: #202820; }
          .signature p { margin: 0 0 2px; }
          .signature-space { height: 56px; }
          .signature-name { font-weight: 700; text-decoration: underline; }
          /* Without an explicit page box the printer driver picks its own default
             margins, so the usable width is unknown at authoring time. Declaring
             A4 with 12mm margins pins it at 186mm: the content then lays out at
             real size instead of being scaled down to fit, which is what made the
             rows shorter, the text smaller and the whole document a page longer. */
          @page { size: A4 portrait; margin: 12mm; }
          @media print {
            body { padding: 0; font-size: 10.5px; }
            /* 900px is wider than the 186mm page box; letting it overflow made
               Chrome shrink the entire document to fit, which shrank the text and
               added height rather than saving it. */
            main { max-width: none; width: 100%; }
            .logo { width: 54px; height: 54px; }
            h1 { font-size: 17px; }
            header { break-inside: avoid; }
            h2 { break-after: avoid; }
            tr { break-inside: avoid; }
            thead { display: table-header-group; }
            tfoot { break-inside: avoid; }
            .signature { break-inside: avoid; }
            /* Tighter rhythm than the screen view: every block below still fits
               comfortably on one sheet for a typical student, so the report stops
               spilling a nearly-empty second page for a handful of transactions. */
            h2 { margin: 14px 0 6px; }
            .report-title { margin: 12px 0 3px; }
            th, td { padding: 4px 6px; }
            .bank { margin: 10px 0 0; padding: 7px 9px; }
            .signature { margin-top: 18px; }
            .signature-space { height: 34px; }
            .printed { margin-top: 10px; }
          }
        </style>
      </head>
      <body>
        <main>
          <header>
            ${logo}
            <div class="school">
              <h1>${escapeHtml(institutionName)}</h1>
              ${address ? `<p>Alamat: ${escapeHtml(address)}</p>` : ""}
              ${contact ? `<p>${contact}</p>` : ""}
            </div>
          </header>
          <h2 class="report-title">LAPORAN PEMBAYARAN SISWA</h2>
          <p class="year">Tahun Ajaran ${escapeHtml(academicYearLabel)}</p>
          ${bankBlock}
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
          <div class="signature">
            <p>${escapeHtml(place)}, ${escapeHtml(signDate)}</p>
            <p>${escapeHtml(roleLabel)}</p>
            <div class="signature-space"></div>
            <p class="signature-name">${escapeHtml(signerName || "\u00a0")}</p>
            <p>${escapeHtml(nipLine)}</p>
          </div>
          <p class="printed">Dicetak: ${escapeHtml(printedTime)}</p>
        </main>
      </body>
    </html>`);
  printWindow.document.close();

  const printWhenReady = (): void => {
    const images = Array.from(printWindow.document.images);
    const waitForImage = (image: HTMLImageElement): Promise<void> => {
      if (typeof image.decode === "function") {
        return image.decode().catch(() => undefined);
      }
      return new Promise<void>((resolve) => {
        if (image.complete) {
          resolve();
          return;
        }
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    };

    void Promise.all(images.map(waitForImage)).then(() => {
      window.setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 100);
    });
  };

  printWhenReady();
}
