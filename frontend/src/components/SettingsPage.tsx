import { useState } from "react";
import { Banknote, BookOpenCheck, Check, CircleDollarSign, Plus, Sparkles } from "lucide-react";
import { months } from "../constants";



export function SettingsPage({
  activeTab,
  setActiveTab,
  sppAmounts,
  setSppAmounts,
  costs,
}: {
  activeTab: "spp" | "biaya";
  setActiveTab: (value: "spp" | "biaya") => void;
  sppAmounts: number[];
  setSppAmounts: React.Dispatch<React.SetStateAction<number[]>>;
  costs: { name: string; type: string; amount: number }[];
}) {
  const [amounts, setAmounts] = useState(costs.map((cost) => cost.amount));
  const [saved, setSaved] = useState(false);
  const [syncedFrom, setSyncedFrom] = useState(costs);
  // Reset the editable copy when the server returns a new tariff list. This is
  // the documented "adjust state during render" pattern instead of an effect.
  if (syncedFrom !== costs) {
    setSyncedFrom(costs);
    setAmounts(costs.map((cost) => cost.amount));
  }
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
      {activeTab === "spp" ? (
        <div className="settings-content">
          <div className="settings-title">
            <div>
              <span className="eyebrow">TAHUN AJARAN 2026 / 2027</span>
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
            {[
              "Kelas I",
              "Kelas II",
              "Kelas III",
              "Kelas IV",
              "Kelas V",
              "Kelas VI",
            ].map((className, index) => (
              <div className="tariff-row" key={className}>
                <span>
                  <div className={`class-emblem emblem-${index % 3}`}>
                    {["I", "II", "III", "IV", "V", "VI"][index]}
                  </div>
                  <strong>{className}</strong>
                </span>
                <label className="money-input">
                  <span>Rp</span>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={sppAmounts[index] ?? sppAmounts[0]}
                    onChange={(event) =>
                      setSppAmounts((current) =>
                        current.map((amount, itemIndex) =>
                          itemIndex === index
                            ? Number(event.target.value)
                            : amount,
                        ),
                      )
                    }
                    aria-label={`Tarif SPP ${className}`}
                  />
                </label>
                <span className="active-badge">
                  <i /> Aktif
                </span>
              </div>
            ))}
          </div>
          <div className="settings-tip">
            <Sparkles size={17} />
            <span>
              <strong>Penyesuaian tarif otomatis</strong> · Perubahan berlaku
              untuk tagihan yang belum dibayar.
            </span>
          </div>
          <div className="settings-actions">
            <span>Terakhir diperbarui 28 September 2026</span>
            <button
              className="button button-primary"
              onClick={() => setSaved(true)}
            >
              <Check size={16} />{" "}
              {saved ? "Perubahan tersimpan" : "Simpan pengaturan"}
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
            <button className="button button-outline">
              <Plus size={15} /> Tambah pos
            </button>
          </div>
          <div className="cost-list">
            {costs.map((cost, index) => (
              <article className="cost-row" key={cost.name}>
                <div className="cost-icon">
                  <Banknote size={17} />
                </div>
                <div className="cost-name">
                  <strong>{cost.name}</strong>
                  <span>{cost.type}</span>
                </div>
                <label className="money-input">
                  <span>Rp</span>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={amounts[index]}
                    onChange={(event) =>
                      setAmounts((items) =>
                        items.map((value, itemIndex) =>
                          itemIndex === index
                            ? Number(event.target.value)
                            : value,
                        ),
                      )
                    }
                    aria-label={`Tarif ${cost.name}`}
                  />
                </label>
                <button
                  className="switch-control on"
                  aria-label={`${cost.name} aktif`}
                >
                  <i />
                </button>
              </article>
            ))}
          </div>
          <div className="settings-actions">
            <span>Tarif dapat dibedakan untuk tiap tingkat kelas.</span>
            <button
              className="button button-primary"
              onClick={() => setSaved(true)}
            >
              <Check size={16} />{" "}
              {saved ? "Perubahan tersimpan" : "Simpan pengaturan"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default SettingsPage;
