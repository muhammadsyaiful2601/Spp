import type { ModalKind, Profile, Transaction } from "../types";
import { Printer, X } from "lucide-react";
import { money } from "../lib/format";
import { MosqueMark } from "./icons";

export function ReceiptModal({
  profile,
  receiptTransaction,
  setModal,
}: {
  modal: ModalKind;
  profile: Profile;
  receiptTransaction: Transaction;
  setModal: (value: ModalKind) => void;
}) {
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
              <div className="receipt-paper">
                <div className="receipt-brand">
                  {profile.logo ? (
                    <img src={profile.logo} alt="Logo sekolah" />
                  ) : (
                    <div className="receipt-logo">
                      <MosqueMark size={21} />
                    </div>
                  )}
                  <div>
                    <strong>{profile.school}</strong>
                    <span>{profile.address}</span>
                    <span>
                      {profile.phone} · {profile.email}
                    </span>
                  </div>
                </div>
                <div className="receipt-divider" />
                <div className="receipt-title">
                  <h3>BUKTI PEMBAYARAN</h3>
                  <span>{receiptTransaction.id}</span>
                </div>
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
                <div className="receipt-total">
                  <span>Total dibayarkan</span>
                  <strong>{money(receiptTransaction.amount)}</strong>
                </div>
                <p className="receipt-note">{profile.note}</p>
                <div className="receipt-signature">
                  <span>Petugas penerima</span>
                  <strong>Nadia Amalia</strong>
                </div>
              </div>
              <div className="modal-actions no-print">
                <button
                  className="button button-outline"
                  onClick={() => setModal(null)}
                >
                  Tutup
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
