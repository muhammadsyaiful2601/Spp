import type { Cost, ModalKind, Student } from "../types";
import { Check, X } from "lucide-react";
import { money } from "../lib/format";
import { monthNames } from "../constants";

type PositionCost = Cost & { rateId: number };

export function PaymentModal({
  activeCost,
  payAmount,
  payKind,
  payMonths,
  paidMonths,
  positionRates,
  sppAmountsByMonth,
  remainingCost,
  paymentBusy,
  paymentError,
  savePayment,
  selected,
  selectedCost,
  selectedSppAmount,
  paymentBillsLoading,
  paymentBillsError,
  setModal,
  setPayAmount,
  setPayCost,
  setPayKind,
  setPayMonths,
}: {
  activeCost: PositionCost | undefined;
  modal: ModalKind;
  payAmount: number;
  payKind: "spp" | "non-spp";
  payMonths: number[];
  paidMonths: number[];
  positionRates: PositionCost[];
  sppAmountsByMonth: number[];
  remainingCost: number;
  paymentBusy: boolean;
  paymentError: string;
  savePayment: () => void;
  selected: Student;
  selectedCost: Cost | undefined;
  selectedSppAmount: number;
  paymentBillsLoading: boolean;
  paymentBillsError: boolean;
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
                {(positionRates.length > 0 || payKind === "non-spp") && (
                  <button
                    className={payKind === "non-spp" ? "selected" : ""}
                    onClick={() => setPayKind("non-spp")}
                    disabled={positionRates.length === 0 && payKind !== "non-spp"}
                  >
                    Biaya lainnya
                  </button>
                )}
              </div>
              {payKind === "spp" ? (
                <>
                  <div className="field-label-row">
                    <label>Pilih bulan yang akan dibayar</label>
                    <span>Tarif sesuai bulan · {money(selectedSppAmount)} / bulan</span>
                  </div>
                  <div className="month-grid">
                    {monthNames.map((month, index) => {
                      const isPaid = paidMonths.includes(index);
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
                          <small>
                            {isPaid ? "Lunas" : money(sppAmountsByMonth[index] ?? selectedSppAmount)}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="form-field">
                  {positionRates.length > 0 ? (
                    <>
                      <label htmlFor="pay-cost">Pilih pos biaya</label>
                      <select
                        id="pay-cost"
                        value={activeCost?.rateId ?? ""}
                        onChange={(event) => {
                          const cost = positionRates.find(
                            (item) => item.rateId === Number(event.target.value),
                          );
                          setPayCost(cost?.name ?? "");
                          setPayAmount(cost?.amount ?? 0);
                        }}
                      >
                        {positionRates.map((cost) => (
                          <option key={cost.rateId} value={cost.rateId}>
                            {cost.name} · Sisa {money(cost.amount)}
                          </option>
                        ))}
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
                    </>
                  ) : (
                    <p className="field-hint" role="status">
                      {paymentBillsLoading
                        ? "Memuat tagihan biaya lainnya..."
                        : paymentBillsError
                          ? "Tagihan biaya lainnya gagal dimuat. Tutup lalu coba lagi."
                          : "Semua tagihan biaya lainnya sudah lunas."}
                    </p>
                  )}
                </div>
              )}
              <div className="payment-total">
                <span>Total pembayaran</span>
                <strong>
                  {money(
                    payKind === "spp"
                      ? payMonths.reduce(
                          (total, month) => total + (sppAmountsByMonth[month] ?? selectedSppAmount),
                          0,
                        )
                      : Math.min(payAmount, remainingCost),
                  )}
                </strong>
              </div>
              {paymentError && (
                <div className="payment-bills-error" role="alert">{paymentError}</div>
              )}
              <div className="modal-actions">
                <button
                  className="button button-outline"
                  onClick={() => setModal(null)}
                >
                  Batal
                </button>
                <button
                  className="button button-primary"
                  onClick={savePayment}
                  disabled={paymentBusy || (payKind === "non-spp" && (!selectedCost || remainingCost <= 0))}
                >
                  <Check size={16} /> {paymentBusy ? "Menyimpan..." : "Simpan pembayaran"}
                </button>
              </div>
            </section>
          </div>
        
  );
}

export default PaymentModal;
