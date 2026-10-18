import { useState } from "react";
import { Loader2, PencilLine, ShieldAlert, X } from "lucide-react";
import type { StudentTransaction, UpdatePaymentInput } from "../api";
import { money } from "../lib/format";
import { monthNames } from "../constants";

/** ISO timestamp to the `datetime-local` value the input expects. */
function toLocalInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Grid position (0 = Jul .. 11 = Jun) to the calendar month the API uses.
 *
 * Only ever applied when *sending* a selection. `context.monthlyAmounts` is
 * already built in this same academic order, so reading it must use the grid
 * index untouched — routing it back through this function read July's slot as
 * January's and priced every one of the twelve months with another month's rate.
 */
function toCalendarMonth(index: number): number {
  return index < 6 ? index + 7 : index - 5
}

function toGridIndex(month: number): number {
  return month >= 7 ? month - 7 : month + 5;
}

/** What the correction form needs to know about the rest of the student's bills. */
export type PaymentEditContext = {
  /** Calendar months already settled by a *different* payment. */
  lockedMonths: number[];
  /** Calendar month to the SPP tariff, so the preview matches the bill. */
  monthlyAmounts: number[];
};

/**
 * Correction form for a mis-keyed payment.
 *
 * The date is always editable. The amount only applies to a non-SPP payment,
 * because an SPP amount is the sum of the months it settled. For SPP the month
 * list is what gets corrected — pick the wrong month and the bill, the arrears
 * and the receipt all have to move with it.
 */
export function PaymentEditModal({
  transaction,
  context,
  busy,
  error,
  onSave,
  onClose,
}: {
  transaction: StudentTransaction;
  context: PaymentEditContext;
  busy: boolean;
  error: string;
  onSave: (input: UpdatePaymentInput) => void;
  onClose: () => void;
}) {
  const isSpp = transaction.type === "spp";
  const [months, setMonths] = useState<number[]>(() =>
    transaction.months.map(toGridIndex),
  );
  const [amount, setAmount] = useState(String(transaction.amount));
  const [paidAt, setPaidAt] = useState(toLocalInput(transaction.paid_at));

  const originalMonths = transaction.months.map(toGridIndex);
  const sortedMonths = [...months].sort((a, b) => a - b);
  const monthsChanged =
    isSpp &&
    (sortedMonths.length !== originalMonths.length ||
      sortedMonths.some((month, index) => month !== originalMonths[index]));
  const amountChanged = !isSpp && Number(amount) > 0 && Number(amount) !== transaction.amount;
  const dateChanged =
    paidAt !== "" &&
    new Date(paidAt).getTime() !== new Date(transaction.paid_at).getTime();
  const amountInvalid = !isSpp && (!Number.isFinite(Number(amount)) || Number(amount) <= 0);
  const noMonthsLeft = isSpp && months.length === 0;
  const nothingToSave = !dateChanged && !amountChanged && !monthsChanged;

  const previewTotal = isSpp
    ? months.reduce((total, index) => total + (context.monthlyAmounts[index] ?? 0), 0)
    : Number(amount);

  function submit() {
    const input: UpdatePaymentInput = {};
    if (dateChanged) input.paid_at = new Date(paidAt).toISOString();
    if (amountChanged) input.amount = Number(amount);
    if (monthsChanged) input.months = months.map(toCalendarMonth);
    if (Object.keys(input).length === 0) return;
    onSave(input);
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section className="modal payment-modal" role="dialog" aria-modal="true" aria-labelledby="edit-payment-title">
        <div className="modal-head">
          <div>
            <div className="eyebrow">KOREKSI PEMBAYARAN</div>
            <h2 id="edit-payment-title">{transaction.detail}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Tutup"
            onClick={onClose}
            disabled={busy}
          >
            <X size={19} />
          </button>
        </div>
        <p className="modal-note">
          Nomor transaksi <strong>{transaction.number}</strong> · tercatat {transaction.date}.
          Koreksi ini masuk ke log aktivitas beserta nilai lama dan baru.
        </p>
        {isSpp ? (
          <>
            <div className="field-label-row">
              <label>Bulan yang dibayar</label>
              <span>Awal: {transaction.detail.replace(/^SPP · /, "")}</span>
            </div>
            <div className="month-grid edit-month-grid">
              {monthNames.map((month, index) => {
                // A month settled by another payment cannot be moved here.
                const isLocked = context.lockedMonths.includes(toCalendarMonth(index));
                const isChosen = months.includes(index);
                return (
                  <button
                    key={month}
                    type="button"
                    disabled={isLocked || busy}
                    className={`month-option ${isLocked ? "is-paid" : ""} ${isChosen ? "is-selected" : ""}`}
                    onClick={() =>
                      setMonths((items) =>
                        items.includes(index)
                          ? items.filter((item) => item !== index)
                          : [...items, index],
                      )
                    }
                  >
                    <span>{month}</span>
                    <small>
                      {isLocked
                        ? "Lunas"
                        : money(context.monthlyAmounts[index] ?? 0)}
                    </small>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="form-field">
            <label htmlFor="edit-payment-amount">Nominal pembayaran</label>
            <input
              id="edit-payment-amount"
              type="number"
              min="1"
              step="1000"
              value={amount}
              disabled={busy}
              onChange={(event) => setAmount(event.target.value)}
            />
            <small className="field-hint">Awal: {money(transaction.amount)}</small>
          </div>
        )}
        <div className="form-field edit-payment-date">
          <label htmlFor="edit-payment-date">Tanggal & waktu pembayaran</label>
          <input
            id="edit-payment-date"
            type="datetime-local"
            value={paidAt}
            disabled={busy}
            onChange={(event) => setPaidAt(event.target.value)}
          />
          <small className="field-hint">Tidak boleh diisi tanggal di masa depan.</small>
        </div>
        <div className="payment-total">
          <span>Total setelah koreksi</span>
          <strong>{money(previewTotal)}</strong>
        </div>
        {isSpp && (
          <p className="billing-note edit-payment-note">
            <ShieldAlert size={16} />
            <span>
              Bulan yang dilepas akan kembali menjadi tagihan, dan nominal mengikuti
              tarif bulan yang dipilih — bukan diketik manual.
            </span>
          </p>
        )}
        {error ? (
          <p className="form-error edit-payment-error" role="alert">{error}</p>
        ) : null}
        <div className="modal-actions">
          <button
            type="button"
            className="button button-outline"
            onClick={onClose}
            disabled={busy}
          >
            Batal
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={submit}
            disabled={busy || nothingToSave || amountInvalid || noMonthsLeft}
          >
            {busy ? <Loader2 size={16} className="spin" /> : <PencilLine size={16} />}
            {busy ? "Menyimpan..." : "Simpan koreksi"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default PaymentEditModal;