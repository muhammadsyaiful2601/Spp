import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ModalKind, Profile, Student, Transaction } from "../types";
import type { AuthUser } from "../api";
import { Download, Printer, X } from "lucide-react";
import { money } from "../lib/format";
import { MosqueMark } from "./icons";

const NUMBER_WORDS = [
  "",
  "Satu",
  "Dua",
  "Tiga",
  "Empat",
  "Lima",
  "Enam",
  "Tujuh",
  "Delapan",
  "Sembilan",
  "Sepuluh",
  "Sebelas",
  "Dua Belas",
  "Tiga Belas",
  "Empat Belas",
  "Lima Belas",
  "Enam Belas",
  "Tujuh Belas",
  "Delapan Belas",
  "Sembilan Belas",
  "Dua Puluh",
];

/**
 * Words for one 0-999 group. Indonesian only has dedicated forms up to twenty,
 * so everything above that is "se-X" — three ratus, not "Tiga Ratus".
 */
function wordsUnderThousand(value: number): string {
  if (value === 0) return "";
  if (value < 20) return NUMBER_WORDS[value];

  const hundreds = Math.floor(value / 100);
  const rest = value % 100;

  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${NUMBER_WORDS[hundreds]} Ratus`);
  if (rest > 0) {
    parts.push(
      rest < 20
        ? NUMBER_WORDS[rest]
        : `${NUMBER_WORDS[Math.floor(rest / 10)]} Puluh${rest % 10 > 0 ? ` ${NUMBER_WORDS[rest % 10]}` : ""}`,
    );
  }
  return parts.join(" ");
}

/**
 * Terbilang for the words-under-the-total line Indonesian receipts expect.
 *
 * Indonesian groups by thousands, not by a million-and-remainder the way the
 * previous flat scale list implied: every three digits are read with the same
 * 0-999 vocabulary and then qualified with its scale (juta / ribu). The earlier
 * version looked a chunk straight up in a 21-entry table, so anything from
 * Rp 21.000 upward printed "undefined" — which is every realistic school fee.
 */
function toWords(amount: number): string {
  const whole = Math.floor(Math.abs(amount));
  if (!Number.isFinite(whole) || whole === 0) return "Nol Rupiah";

  const scales: [number, string][] = [
    [1_000_000_000, "Miliar"],
    [1_000_000, "Juta"],
    [1_000, "Ribu"],
  ];

  const groups: string[] = [];
  let rest = whole;

  for (const [value, label] of scales) {
    const chunk = Math.floor(rest / value);
    if (chunk > 0) {
      groups.push(`${wordsUnderThousand(chunk)} ${label}`);
      rest %= value;
    }
  }
  if (rest > 0) groups.push(wordsUnderThousand(rest));

  return `${groups.join(" ").trim()} Rupiah`;
}

/** Collapse the stored multiline address into one line for the letterhead. */
function compactAddress(address: string): string {
  return address
    .split(/[\n\r]+/)
    .flatMap((line) => line.split(","))
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

function placeFromAddress(address: string): string {
  const parts = compactAddress(address)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const last = parts.at(-1) ?? "";
  return last && !/^[-–—\s.]*$/.test(last) ? last : "............................";
}

export function ReceiptModal({
  profile,
  receiptTransaction,
  receiptStudent,
  receiptClassName,
  setModal,
  currentUser,
}: {
  modal: ModalKind;
  profile: Profile;
  receiptTransaction: Transaction;
  /** Full student record when found, so NIS/NISN can be printed too. */
  receiptStudent?: Student;
  receiptClassName?: string;
  setModal: (value: ModalKind) => void;
  currentUser: AuthUser | null;
}) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");

  // A number on its own is still actionable, so the block renders as soon as
  // any part is on file and labels only what was actually filled in.
  const bankFields = {
    name: profile.bankName.trim(),
    number: profile.bankAccountNumber.trim(),
    holder: profile.bankAccountHolder.trim(),
  };
  const bankAccount =
    bankFields.name || bankFields.number || bankFields.holder
      ? {
          name: bankFields.name || "-",
          number: bankFields.number || "-",
          holder: bankFields.holder || "-",
        }
      : null;

  // Captured once when the receipt opens so the printed date cannot drift while
  // the modal sits on screen.
  const [printedAt] = useState(() => new Date());

  // Clears the print flag however the dialog ends — printed, cancelled, or
  // closed by the browser. Without this the portal would stay hidden and the
  // app would look blank after the first cancelled print.
  useEffect(() => {
    const clear = () => document.body.classList.remove("printing-receipt");
    window.addEventListener("afterprint", clear);
    return () => {
      window.removeEventListener("afterprint", clear);
      clear();
    };
  }, []);
  const printedDate = printedAt.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const printedTime = printedAt.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const paidAt = receiptTransaction.paidAt
    ? new Date(receiptTransaction.paidAt)
    : null;
  const paidDate = paidAt && !Number.isNaN(paidAt.getTime())
    ? paidAt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : "";
  const paidTime = paidAt && !Number.isNaN(paidAt.getTime())
    ? paidAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : "";

  const institutionName = (profile.foundation.trim() || profile.school.trim()).toLocaleUpperCase(
    "id-ID",
  );
  const address = compactAddress(profile.address);
  const contact = [
    profile.phone.trim() && `Telp. ${profile.phone.trim()}`,
    profile.email.trim() && `Email: ${profile.email.trim()}`,
  ]
    .filter(Boolean)
    .join("  ·  ");
  const place = placeFromAddress(profile.address);
  const roleLabel =
    currentUser?.role === "pimpinan" ? "Pimpinan Sekolah" : "Petugas Keuangan";
  const nipLine = currentUser?.nip?.trim()
    ? `NIP. ${currentUser.nip.trim()}`
    : "NIP. .............................";
  const className = receiptStudent?.className || receiptClassName;
  const amount = receiptTransaction.amount;

  async function downloadPDF() {
    const receiptElement = receiptRef.current;
    if (!receiptElement) return;

    setPdfBusy(true);
    setPdfError("");
    try {
      // Loaded on demand, not at module scope. Together these two are the bulk
      // of the bundle, and nothing on this screen needs them until the user
      // actually asks for a PDF — a static import dragged both into the initial
      // chunk for every visitor, including everyone who only ever reads the
      // receipt on screen.
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(receiptElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a5",
      });

      const imgData = canvas.toDataURL("image/png");
      const margin = 10;
      const maxWidth = pdf.internal.pageSize.getWidth() - margin * 2;
      const maxHeight = pdf.internal.pageSize.getHeight() - margin * 2;
      const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
      const imgWidth = canvas.width * scale;
      const imgHeight = canvas.height * scale;
      const x = (pdf.internal.pageSize.getWidth() - imgWidth) / 2;

      pdf.addImage(imgData, "PNG", x, margin, imgWidth, imgHeight);
      pdf.save(`kuitansi-${receiptTransaction.id}.pdf`);
    } catch {
      setPdfError("PDF kuitansi gagal dibuat. Silakan coba lagi.");
    } finally {
      setPdfBusy(false);
    }
  }

  // Rendered into a portal on `document.body` rather than inline in the app tree.
  //
  // Printing hid the rest of the portal with `visibility: hidden`, which only
  // stops the pixels — the layout is still built, so the sidebar, topbar and
  // every screen behind the modal kept reserving height and pushed a blank
  // second sheet into the print job. From `body` the receipt is a sibling of
  // the app root, so the whole of `#root` can be taken out of the document
  // flow for the duration of the print and the receipt lands on one sheet.
  return createPortal(
    (
    <div className="modal-backdrop receipt-backdrop">
      <section
        className="modal receipt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
      >
        <div className="modal-head no-print">
          <div>
            <div className="eyebrow">PEMBAYARAN BERHASIL</div>
            <h2 id="receipt-title">Kuitansi pembayaran</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Tutup"
            onClick={() => setModal(null)}
          >
            <X size={19} />
          </button>
        </div>
        <div className="receipt-paper" ref={receiptRef}>
          <header className="receipt-brand">
            {profile.logo ? (
              <img src={profile.logo} alt="Logo sekolah" />
            ) : (
              <div className="receipt-logo">
                <MosqueMark size={24} />
              </div>
            )}
            <div className="receipt-brand-copy">
              <strong>{institutionName}</strong>
              {address && <span>Alamat: {address}</span>}
              {contact && <span>{contact}</span>}
            </div>
          </header>
          <div className="receipt-rule" />
          <div className="receipt-heading">
            <div>
              <span className="receipt-eyebrow">BUKTI TRANSAKSI</span>
              <h3>Kuitansi Pembayaran</h3>
            </div>
            <span className="receipt-paid"><i /> LUNAS</span>
          </div>
          <div className="receipt-reference">
            <div>
              <span>Nomor kuitansi</span>
              <strong>{receiptTransaction.id}</strong>
            </div>
            <div>
              <span>Tanggal cetak</span>
              <strong>{printedDate}</strong>
            </div>
          </div>
          <div className="receipt-details">
            <div className="receipt-line">
              <span>Nama siswa</span>
              <strong>{receiptTransaction.student}</strong>
            </div>
            {receiptStudent?.id && (
              <div className="receipt-line">
                <span>NIS</span>
                <strong>{receiptStudent.id}</strong>
              </div>
            )}
            {receiptStudent?.nisn && (
              <div className="receipt-line">
                <span>NISN</span>
                <strong>{receiptStudent.nisn}</strong>
              </div>
            )}
            {className && (
              <div className="receipt-line">
                <span>Kelas</span>
                <strong>{className}</strong>
              </div>
            )}
            <div className="receipt-line">
              <span>Rincian pembayaran</span>
              <strong>{receiptTransaction.detail}</strong>
            </div>
            <div className="receipt-line">
              <span>Tanggal transaksi</span>
              <strong>
                {paidDate || receiptTransaction.date}
                {paidTime ? ` pukul ${paidTime}` : ""}
              </strong>
            </div>
            <div className="receipt-line">
              <span>Status pembayaran</span>
              <strong>{receiptTransaction.status}</strong>
            </div>
          </div>
          <div className="receipt-total">
            <div>
              <span>Total diterima</span>
              <small>{toWords(amount)}</small>
            </div>
            <strong>{money(amount)}</strong>
          </div>
          {bankAccount && (
            <div className="receipt-bank">
              <span className="receipt-bank-label">
                {bankFields.name
                  ? "Pembayaran melalui transfer ke rekening berikut:"
                  : "Rekening transfer pembayaran:"}
              </span>
              <div className="receipt-bank-row">
                <span>Nama bank</span>
                <strong>{bankAccount.name}</strong>
              </div>
              <div className="receipt-bank-row">
                <span>Nomor rekening</span>
                <strong className="receipt-bank-number">{bankAccount.number}</strong>
              </div>
              <div className="receipt-bank-row">
                <span>Atas nama</span>
                <strong>{bankAccount.holder}</strong>
              </div>
            </div>
          )}
          {profile.note && <p className="receipt-note">{profile.note}</p>}
          <footer className="receipt-signature">
            <div className="receipt-thankyou">
              <strong>Terima kasih</strong>
              <span>Simpan kuitansi ini sebagai bukti pembayaran yang sah.</span>
            </div>
            <div className="receipt-signature-copy">
              <span>{place}, {printedDate}</span>
              <span>{roleLabel}</span>
              <div className="receipt-signature-space" />
              <strong>{currentUser?.name?.trim() || "\u00a0"}</strong>
              <small>{nipLine}</small>
            </div>
          </footer>
          <p className="receipt-footer">
            Dicetak oleh {currentUser?.name?.trim() || "Petugas"} pada{" "}
            {printedDate} pukul {printedTime} WIB · Kuitansi ini sah tanpa tanda
            tangan basah dan dapat dicetak ulang dari sistem.
          </p>
        </div>
        {pdfError && <p className="form-error receipt-error" role="alert">{pdfError}</p>}
        <div className="modal-actions no-print">
          <button
            className="button button-outline"
            onClick={() => setModal(null)}
          >
            Tutup
          </button>
          <button
            className="button button-outline"
            onClick={downloadPDF}
            disabled={pdfBusy}
          >
            <Download size={16} /> {pdfBusy ? "Menyiapkan PDF..." : "Unduh PDF"}
          </button>
          <button
            className="button button-primary"
            onClick={() => {
              // The flag is what lets the print stylesheet drop `#root` out of
              // the document entirely. It is cleared again on `afterprint`
              // because a cancelled print dialog still fires the print event
              // in some browsers, and leaving the app hidden would strand the
              // user on a blank screen.
              document.body.classList.add("printing-receipt");
              window.print();
            }}
          >
            <Printer size={16} /> Cetak kuitansi
          </button>
        </div>
      </section>
    </div>
    ),
    document.body,
  );
}

export default ReceiptModal;