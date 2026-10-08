import { useRef, useState } from "react";
import type { ModalKind, Profile, Transaction } from "../types";
import type { AuthUser } from "../api";
import { Download, Printer, X } from "lucide-react";
import { money } from "../lib/format";
import { MosqueMark } from "./icons";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export function ReceiptModal({
  profile,
  receiptTransaction,
  setModal,
  currentUser,
}: {
  modal: ModalKind;
  profile: Profile;
  receiptTransaction: Transaction;
  setModal: (value: ModalKind) => void;
  currentUser: AuthUser | null;
}) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");

  async function downloadPDF() {
    const receiptElement = receiptRef.current;
    if (!receiptElement) return;

    setPdfBusy(true);
    setPdfError("");
    try {
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

  return (
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
                <MosqueMark size={21} />
              </div>
            )}
            <div className="receipt-brand-copy">
              <strong>{profile.school}</strong>
              {profile.foundation && <span>{profile.foundation}</span>}
              {profile.address && <span>{profile.address}</span>}
              {(profile.phone || profile.email) && (
                <span>{[profile.phone, profile.email].filter(Boolean).join(" · ")}</span>
              )}
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
            <span>Nomor kuitansi</span>
            <strong>{receiptTransaction.id}</strong>
          </div>
          <div className="receipt-details">
            <div className="receipt-line">
              <span>Nama siswa</span>
              <strong>{receiptTransaction.student}</strong>
            </div>
            <div className="receipt-line">
              <span>Rincian pembayaran</span>
              <strong>{receiptTransaction.detail}</strong>
            </div>
            <div className="receipt-line">
              <span>Tanggal transaksi</span>
              <strong>{receiptTransaction.date}</strong>
            </div>
          </div>
          <div className="receipt-total">
            <span>Total diterima</span>
            <strong>{money(receiptTransaction.amount)}</strong>
          </div>
          {profile.note && <p className="receipt-note">{profile.note}</p>}
          <footer className="receipt-signature">
            <div className="receipt-signature-copy">
              <span>Diserahkan oleh</span>
              <strong>{currentUser?.name ?? "Petugas"}</strong>
              <small>Petugas penerima</small>
            </div>
            <div className="receipt-thankyou">
              <strong>Terima kasih</strong>
              <span>Simpan kuitansi ini sebagai bukti pembayaran yang sah.</span>
            </div>
          </footer>
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
            onClick={() => window.print()}
          >
            <Printer size={16} /> Cetak kuitansi
          </button>
        </div>
      </section>
    </div>
  );
}

export default ReceiptModal;
