import type { Cost, ModalKind, Student } from "../types";
import { Check, X } from "lucide-react";
import { money } from "../lib/format";
import { monthNames } from "../constants";

export function PaymentModal({
  activeCost,
  payAmount,
  payKind,
  payMonths,
  positionRates,
  remainingCost,
  savePayment,
  selected,
  selectedCost,
  selectedSppAmount,
  setModal,
  setPayAmount,
  setPayCost,
  setPayKind,
  setPayMonths,
}: {
  activeCost: Cost | undefined;
  modal: ModalKind;
  payAmount: number;
  payKind: "spp" | "non-spp";
  payMonths: number[];
  positionRates: Cost[];
  remainingCost: number;
  savePayment: () => void;
  selected: Student;
  selectedCost: Cost | undefined;
  selectedSppAmount: number;
  setModal: (value: ModalKind) => void;
  setPayAmount: (value: number) => void;
  setPayCost: (value: string) => void;
  setPayKind: (value: 'spp' | 'non-spp') => void;
  setPayMonths: React.Dispatch<React.SetStateAction<number[]>>;
}) {
  return (
          <div
            className="modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setModal(null);
            }}
          >
            <section
              className="modal payment-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="payment-title"
            >
              <div className="modal-head">
                <div>
                  <div className="eyebrow">TRANSAKSI BARU</div>
                  <h2 id="payment-title">Catat pembayaran</h2>
                </div>
                <button
                  className="icon-button"
                  aria-label="Tutup"
                  onClick={() => setModal(null)}
                >
                  <X size={19} />
                </button>
              </div>
              <div className="student-mini">
                <div className="student-avatar">
                  {selected.name
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")}
                </div>
                <div>
                  <strong>{selected.name}</strong>
                  <span>
                    {selected.id} <i /> {selected.className}
                  </span>
                </div>
              </div>
              <div className="segmented">
                <button
                  className={payKind === "spp" ? "selected" : ""}
                  onClick={() => setPayKind("spp")}
                >
                  SPP bulanan
                </button>
                <button
                  className={payKind === "non-spp" ? "selected" : ""}
                  onClick={() => setPayKind("non-spp")}
                >
                  Biaya lainnya
                </button>
              </div>
              {payKind === "spp" ? (
                <>
                  <div className="field-label-row">
                    <label>Pilih bulan yang akan dibayar</label>
                    <span>Tarif {money(selectedSppAmount)} / bulan</span>
                  </div>
                  <div className="month-grid">
                    {monthNames.map((month, index) => {
                      const isPaid = selected.paid.includes(index);
                      return (
                        <button
                          key={month}
                          disabled={isPaid}
                          className={`month-option ${isPaid ? "is-paid" : ""} ${payMonths.includes(index) ? "is-selected" : ""}`}
                          onClick={() =>
                            setPayMonths((items: number[]) =>
                              items.includes(index)
                                ? items.filter((item: number) => item !== index)
                                : [...items, index],
                            )
                          }
                        >
                          {isPaid ? <Check size={13} /> : null}
                          <span>{month}</span>
                          <small>{isPaid ? "Lunas" : "Belum bayar"}</small>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="form-field">
                  <label htmlFor="pay-cost">Pilih pos biaya</label>
                  <select
                    id="pay-cost"
                    value={activeCost?.name ?? ""}
                    disabled={positionRates.length === 0}
                    onChange={(event) => {
                      const cost = positionRates.find(
                        (item) => item.name === event.target.value,
                      );
                      setPayCost(event.target.value);
                      setPayAmount(cost?.amount ?? 0);
                    }}
                  >
                    {positionRates.length === 0 ? (
                      <option value="">Belum ada pos biaya</option>
                    ) : (
                      positionRates.map((cost) => (
                        <option key={cost.name} value={cost.name}>
                          {cost.name} · {money(cost.amount)}
                        </option>
                      ))
                    )}
                  </select>
                  {selectedCost?.type === "Cicilan" && (
                    <>
                      <label htmlFor="pay-amount">Jumlah cicilan</label>
                      <input
                        id="pay-amount"
                        type="number"
                        min="1"
                        max={remainingCost}
                        step="10000"
                        value={Math.min(payAmount, remainingCost)}
                        onChange={(event) =>
                          setPayAmount(Number(event.target.value))
                        }
                      />
                    </>
                  )}
                  <small className="field-hint">
                    {selectedCost?.type === "Cicilan"
                      ? `Sisa tagihan ${money(remainingCost)}.`
                      : "Pembayaran dicatat sebagai pelunasan pos biaya terpilih."}
                  </small>
                </div>
              )}
              <div className="payment-total">
                <span>Total pembayaran</span>
                <strong>
                  {money(
                    payKind === "spp"
                      ? payMonths.length * selectedSppAmount
                      : Math.min(payAmount, remainingCost),
                  )}
                </strong>
              </div>
              <div className="modal-actions">
                <button
                  className="button button-outline"
                  onClick={() => setModal(null)}
                >
                  Batal
                </button>
                <button className="button button-primary" onClick={savePayment}>
                  <Check size={16} /> Simpan pembayaran
                </button>
              </div>
            </section>
          </div>
        
  );
}

export default PaymentModal;
