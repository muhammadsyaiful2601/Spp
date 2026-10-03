import { useState } from "react";
import {
  Banknote,
  BookOpenCheck,
  Check,
  CircleDollarSign,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { months } from "../constants";

/** A per-class SPP row the leadership user is editing. */
export type SppRow = { classLevelId: number; className: string; amount: number };

/** A non-SPP position row for one class level. */
export type CostRow = {
  paymentPositionId: number;
  name: string;
  type: string;
  amount: number;
  isActive: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  sekali_bayar: "Sekali bayar",
  tahunan: "Tahunan",
  cicilan: "Cicilan",
};

export function SettingsPage({
  academicYearLabel,
  activeTab,
  busy,
  costClassId,
  costClassLevels,
  costRows,
  error,
  lastSavedAt,
  onAddPosition,
  onCostAmountChange,
  onSaveCosts,
  onSaveSpp,
  onSetCostClass,
  onSppAmountChange,
  onTogglePosition,
  setActiveTab,
  sppRows,
}: {
  academicYearLabel: string;
  activeTab: "spp" | "biaya";
  busy: boolean;
  costClassId: number | null;
  costClassLevels: { id: number; name: string }[];
  costRows: CostRow[];
  error: string;
  lastSavedAt: string | null;
  onAddPosition: (input: { name: string; type: string; amount: number }) => void;
  onCostAmountChange: (paymentPositionId: number, amount: number) => void;
  onSaveCosts: () => void;
  onSaveSpp: () => void;
  onSetCostClass: (classLevelId: number) => void;
  onSppAmountChange: (classLevelId: number, amount: number) => void;
  onTogglePosition: (row: CostRow, next: boolean) => void;
  setActiveTab: (value: "spp" | "biaya") => void;
  sppRows: SppRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", type: "tahunan", amount: "" });

  const lastSaved = lastSavedAt
    ? new Date(lastSavedAt).toLocaleString("id-ID", {
        dateStyle: "long",
        timeStyle: "short",
      })
    : null;

  const canAdd = draft.name.trim().length > 0 && draft.amount !== "" && Number(draft.amount) >= 0;

  const submitNewPosition = () => {
    if (!canAdd) return;
    onAddPosition({ name: draft.name.trim(), type: draft.type, amount: Number(draft.amount) });
    setDraft({ name: "", type: "tahunan", amount: "" });
    setAdding(false);
  };

  return (
    <section className="panel settings-panel">
      <div className="settings-tabs">
        <button
          className={activeTab === "spp" ? "active" : ""}
          onClick={() => setActiveTab("spp")}
        >
          <BookOpenCheck size={16} /> Tarif SPP
        </button>
        <button
          className={activeTab === "biaya" ? "active" : ""}
          onClick={() => setActiveTab("biaya")}
        >
          <CircleDollarSign size={16} /> Biaya non-SPP
        </button>
      </div>
      {error && <p className="form-error settings-error">{error}</p>}
      {activeTab === "spp" ? (
        <div className="settings-content">
          <div className="settings-title">
            <div>
              <span className="eyebrow">TAHUN AJARAN {academicYearLabel}</span>
              <h2>Tarif SPP per tingkat kelas</h2>
              <p>Nominal berlaku untuk periode semester ganjil dan genap.</p>
            </div>
            <span className="active-badge">
              <i /> Tahun aktif
            </span>
          </div>
          <div className="semester-cards">
            <article>
              <div className="semester-head">
                <div>
                  <span>PERIODE I</span>
                  <h3>Semester Ganjil</h3>
                </div>
                <span className="semester-date">Juli — Desember</span>
              </div>
              <div className="semester-months">
                {months.slice(0, 6).map((month) => (
                  <span key={month}>{month}</span>
                ))}
              </div>
              <small>6 bulan pembayaran</small>
            </article>
            <article>
              <div className="semester-head">
                <div>
                  <span>PERIODE II</span>
                  <h3>Semester Genap</h3>
                </div>
                <span className="semester-date">Januari — Juni</span>
              </div>
              <div className="semester-months">
                {months.slice(6).map((month) => (
                  <span key={month}>{month}</span>
                ))}
              </div>
              <small>6 bulan pembayaran</small>
            </article>
          </div>
          <div className="tariff-table">
            <div className="tariff-row tariff-header">
              <span>TINGKAT KELAS</span>
              <span>NOMINAL PER BULAN</span>
              <span>STATUS</span>
            </div>
            {sppRows.length === 0 ? (
              <div className="tariff-row">
                <span className="metric-caption">
                  Belum ada tingkat kelas. Tambahkan kelas terlebih dahulu.
                </span>
              </div>
            ) : (
              sppRows.map((row, index) => (
                <div className="tariff-row" key={row.classLevelId}>
                  <span>
                    <div className={`class-emblem emblem-${index % 3}`}>
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <strong>{row.className}</strong>
                  </span>
                  <label className="money-input">
                    <span>Rp</span>
                    <input
                      type="number"
                      min="0"
                      step="10000"
                      value={row.amount}
                      onChange={(event) =>
                        onSppAmountChange(row.classLevelId, Number(event.target.value))
                      }
                      aria-label={`Tarif SPP ${row.className}`}
                      disabled={busy}
                    />
                  </label>
                  <span className="active-badge">
                    <i /> Aktif
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="settings-tip">
            <Sparkles size={17} />
            <span>
              <strong>Penyesuaian tarif otomatis</strong> · Perubahan berlaku
              untuk tagihan yang belum dibayar.
            </span>
          </div>
          <div className="settings-actions">
            <span>
              {lastSaved ? `Terakhir disimpan ${lastSaved}` : "Belum ada perubahan tersimpan."}
            </span>
            <button
              className="button button-primary"
              onClick={onSaveSpp}
              disabled={busy || sppRows.length === 0}
            >
              {busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
              Simpan pengaturan
            </button>
          </div>
        </div>
      ) : (
        <div className="settings-content">
          <div className="settings-title">
            <div>
              <span className="eyebrow">POS PEMBAYARAN</span>
              <h2>Tarif biaya non-SPP</h2>
              <p>Kelola nominal dan tipe pembayaran untuk setiap pos biaya.</p>
            </div>
            <button
              type="button"
              className={`button ${adding ? "" : "button-outline"}`}
              onClick={() => setAdding((value) => !value)}
            >
              {adding ? <X size={15} /> : <Plus size={15} />}
              {adding ? "Batal" : "Tambah pos"}
            </button>
          </div>

          {adding && (
            <form
              className="treasurer-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitNewPosition();
              }}
            >
              <label>
                <span>Nama pos biaya</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  required
                  maxLength={100}
                />
              </label>
              <label>
                <span>Tipe pembayaran</span>
                <select
                  value={draft.type}
                  onChange={(event) => setDraft({ ...draft, type: event.target.value })}
                >
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Nominal</span>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={draft.amount}
                  onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                  required
                />
              </label>
              <div className="treasurer-form-actions">
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={busy || !canAdd}
                >
                  {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
                  Simpan pos
                </button>
              </div>
            </form>
          )}

          {costClassLevels.length > 0 && (
            <label className="cost-class-picker">
              <span>Tingkat kelas</span>
              <select
                value={costClassId ?? ""}
                onChange={(event) => onSetCostClass(Number(event.target.value))}
                disabled={busy}
              >
                {costClassLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="cost-list">
            {costRows.length === 0 ? (
              <p className="metric-caption">Belum ada pos biaya.</p>
            ) : (
              costRows.map((row) => (
                <article
                  className={`cost-row ${row.isActive ? "" : "is-off"}`}
                  key={row.paymentPositionId}
                >
                  <div className="cost-icon">
                    <Banknote size={17} />
                  </div>
                  <div className="cost-name">
                    <strong>{row.name}</strong>
                    <span>{TYPE_LABELS[row.type] ?? row.type}</span>
                  </div>
                  <label className="money-input">
                    <span>Rp</span>
                    <input
                      type="number"
                      min="0"
                      step="10000"
                      value={row.amount}
                      onChange={(event) =>
                        onCostAmountChange(row.paymentPositionId, Number(event.target.value))
                      }
                      aria-label={`Tarif ${row.name}`}
                      disabled={busy}
                    />
                  </label>
                  <button
                    type="button"
                    className={`switch-control ${row.isActive ? "on" : ""}`}
                    aria-label={`${row.name} ${row.isActive ? "aktif" : "nonaktif"}`}
                    aria-pressed={row.isActive}
                    disabled={busy}
                    onClick={() => onTogglePosition(row, !row.isActive)}
                  >
                    <i />
                  </button>
                </article>
              ))
            )}
          </div>
          <div className="settings-actions">
            <span>
              Tarif disimpan untuk tingkat kelas terpilih dan berlaku di semua pos.
            </span>
            <button
              className="button button-primary"
              onClick={onSaveCosts}
              disabled={busy || costRows.length === 0 || costClassId === null}
            >
              {busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
              Simpan pengaturan
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default SettingsPage;
