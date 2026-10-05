import { ArrowDownToLine, Building2, Check, ReceiptText, RefreshCw, ShieldCheck, Sparkles, Trash, Upload } from "lucide-react";
import type { Profile } from "../types";
import { MosqueMark, StarMotif } from "./icons";
import { applyTheme, normalizeHex, themePresets } from "../api";



export function ProfilePage({
  profile,
  setProfile,
  uploadLogo,
  onUploadFavicon,
  onRemoveFavicon,
  faviconBusy,
  logoBusy,
  onSaveTheme,
  themeBusy,
  onSave,
  profileBusy,
  verification,
}: {
  profile: Profile;
  setProfile: React.Dispatch<React.SetStateAction<Profile>>;
  uploadLogo: (file?: File) => void;
  onUploadFavicon: (file?: File) => void;
  onRemoveFavicon: () => void;
  faviconBusy: boolean;
  logoBusy: boolean;
  onSaveTheme: (primary: string, accent: string) => void;
  themeBusy: boolean;
  onSave: () => void;
  profileBusy: boolean;
  /** Rendered above the school identity form; null hides it. */
  verification?: React.ReactNode;
}) {
  const activeFavicon = profile.favicon || profile.logo;
  return (
    <div className="profile-layout">
      {verification}
      <section className="panel profile-form">
        <div className="panel-heading">
          <div>
            <h2>Identitas sekolah</h2>
            <p>Informasi resmi untuk aplikasi dan dokumen pembayaran.</p>
          </div>
          <Building2 size={20} />
        </div>
        <div className="logo-field">
          <div className="logo-preview">
            {profile.logo ? (
              <img src={profile.logo} alt="Logo sekolah" />
            ) : (
              <MosqueMark size={27} />
            )}
          </div>
          <div>
            <strong>Logo sekolah</strong>
            <span>PNG, JPG, atau WebP · Maksimal 2 MB · Tersimpan di server</span>
            <label className={`button button-outline upload-button ${logoBusy ? "is-busy" : ""}`}>
              {logoBusy ? <RefreshCw size={15} /> : <ArrowDownToLine size={15} />}
              {logoBusy ? "Mengunggah" : "Unggah logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={logoBusy}
                onChange={(event) => {
                  uploadLogo(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        <div className="favicon-field">
          <div className="favicon-preview">
            {activeFavicon ? (
              <img src={activeFavicon} alt="Favicon sekolah" />
            ) : (
              <MosqueMark size={15} />
            )}
          </div>
          <div className="favicon-detail">
            <strong>Favicon tab browser</strong>
            <span>
              {profile.favicon
                ? "Digunakan pada tab browser seluruh pengguna."
                : profile.logo
                  ? "Belum diatur — tab browser memakai logo sekolah."
                  : "Belum diatur — tab browser memakai ikon bawaan."}
            </span>
            <div className="favicon-actions">
              <label className={`button button-outline upload-button ${faviconBusy ? "is-busy" : ""}`}>
                {faviconBusy ? <RefreshCw size={15} /> : <Upload size={15} />}
                {faviconBusy ? "Menyimpan" : "Unggah favicon"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.ico"
                  disabled={faviconBusy}
                  onChange={(event) => {
                    onUploadFavicon(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              {profile.favicon && (
                <button
                  type="button"
                  className="button button-ghost"
                  disabled={faviconBusy}
                  onClick={onRemoveFavicon}
                >
                  <Trash size={15} /> Kembalikan bawaan
                </button>
              )}
            </div>
          </div>
          <div className="favicon-tab" aria-hidden="true">
            <span className="favicon-tab-icon">
              {activeFavicon ? (
                <img src={activeFavicon} alt="" />
              ) : (
                <MosqueMark size={11} />
              )}
            </span>
            <span className="favicon-tab-text">
              {profile.school || "Portal Keuangan"}
            </span>
          </div>
        </div>

        <div className="theme-field">
          <div className="theme-head">
            <div>
              <strong>Tema warna aplikasi</strong>
              <span>
                Warna utama dan aksen untuk seluruh portal. Tersimpan di server
                dan langsung berlaku bagi semua pengguna.
              </span>
            </div>
            <StarMotif size={16} />
          </div>

          <div className="theme-presets">
            {themePresets.map((preset) => {
              const active =
                preset.primary === profile.themePrimary &&
                preset.accent === profile.themeAccent;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`theme-preset ${active ? "is-active" : ""}`}
                  aria-pressed={active}
                  title={preset.label}
                  onClick={() => {
                    setProfile((value) => ({
                      ...value,
                      themePrimary: preset.primary,
                      themeAccent: preset.accent,
                    }));
                    applyTheme(preset.primary, preset.accent);
                  }}
                >
                  <span
                    className="theme-swatch"
                    style={{
                      background: `linear-gradient(135deg, ${preset.primary} 0 62%, ${preset.accent} 62% 100%)`,
                    }}
                  />
                  <span className="theme-preset-label">{preset.label}</span>
                </button>
              );
            })}
          </div>

          <div className="theme-custom">
            <label className="theme-color">
              <input
                type="color"
                value={normalizeHex(profile.themePrimary, "#24634e")}
                onChange={(event) => {
                  setProfile((value) => ({
                    ...value,
                    themePrimary: event.target.value,
                  }));
                  applyTheme(event.target.value, profile.themeAccent);
                }}
              />
              <span>
                Warna utama
                <small>{profile.themePrimary}</small>
              </span>
            </label>
            <label className="theme-color">
              <input
                type="color"
                value={normalizeHex(profile.themeAccent, "#c88942")}
                onChange={(event) => {
                  setProfile((value) => ({
                    ...value,
                    themeAccent: event.target.value,
                  }));
                  applyTheme(profile.themePrimary, event.target.value);
                }}
              />
              <span>
                Warna aksen
                <small>{profile.themeAccent}</small>
              </span>
            </label>
            <button
              type="button"
              className="button button-primary theme-save"
              disabled={themeBusy}
              onClick={() => onSaveTheme(profile.themePrimary, profile.themeAccent)}
            >
              {themeBusy ? <RefreshCw size={15} /> : <Sparkles size={15} />}
              {themeBusy ? "Menyimpan" : "Simpan tema"}
            </button>
          </div>

          <div className="theme-preview" aria-hidden="true">
            <div className="theme-preview-bar">
              <MosqueMark size={15} />
              <span>{profile.school || "Nama Sekolah"}</span>
            </div>
            <div className="theme-preview-body">
              <span className="theme-preview-chip">Lunas</span>
              <span className="theme-preview-chip is-accent">Tunggakan</span>
              <button type="button" className="button button-primary">
                Aksi utama
              </button>
            </div>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-field full">
            <label htmlFor="profile-school">Nama sekolah</label>
            <input
              id="profile-school"
              value={profile.school}
              onChange={(event) =>
                setProfile((value) => ({
                  ...value,
                  school: event.target.value,
                }))
              }
            />
          </div>
          <div className="form-field full">
            <label htmlFor="profile-foundation">Nama yayasan / instansi</label>
            <input
              id="profile-foundation"
              value={profile.foundation}
              onChange={(event) =>
                setProfile((value) => ({
                  ...value,
                  foundation: event.target.value,
                }))
              }
            />
          </div>
          <div className="form-field full">
            <label htmlFor="profile-address">Alamat lengkap</label>
            <textarea
              id="profile-address"
              rows={2}
              value={profile.address}
              onChange={(event) =>
                setProfile((value) => ({
                  ...value,
                  address: event.target.value,
                }))
              }
            />
          </div>
          <div className="form-field">
            <label htmlFor="profile-phone">Nomor telepon</label>
            <input
              id="profile-phone"
              value={profile.phone}
              onChange={(event) =>
                setProfile((value) => ({ ...value, phone: event.target.value }))
              }
            />
          </div>
          <div className="form-field">
            <label htmlFor="profile-email">Email sekolah</label>
            <input
              id="profile-email"
              type="email"
              value={profile.email}
              onChange={(event) =>
                setProfile((value) => ({ ...value, email: event.target.value }))
              }
            />
          </div>
          <div className="form-field full">
            <label htmlFor="profile-note">Catatan pada kuitansi</label>
            <input
              id="profile-note"
              value={profile.note}
              onChange={(event) =>
                setProfile((value) => ({ ...value, note: event.target.value }))
              }
            />
          </div>
        </div>
        <div className="profile-actions">
          <span>
            {profileBusy
              ? "Menyimpan ke server..."
              : "Tersimpan di server — berlaku untuk seluruh pengguna dan perangkat."}
          </span>
          <button
            className="button button-primary"
            disabled={profileBusy}
            onClick={onSave}
          >
            {profileBusy ? <RefreshCw size={16} /> : <Check size={16} />}
            {profileBusy ? "Menyimpan" : "Simpan profil"}
          </button>
        </div>
      </section>
      <aside className="profile-aside">
        <div className="preview-label">
          <span>PRATINJAU DOKUMEN</span>
          <ReceiptText size={17} />
        </div>
        <div className="mini-receipt">
          <div className="mini-receipt-brand">
            {profile.logo ? (
              <img src={profile.logo} alt="" />
            ) : (
              <div>
                <MosqueMark size={18} />
              </div>
            )}
            <span>
              <strong>{profile.school}</strong>
              <small>{profile.address}</small>
            </span>
          </div>
          <div className="mini-receipt-line" />
          <strong className="mini-receipt-title">BUKTI PEMBAYARAN</strong>
          <div className="mini-line">
            <span>Nama siswa</span>
            <i />
          </div>
          <div className="mini-line">
            <span>Rincian</span>
            <i />
          </div>
          <div className="mini-line">
            <span>Tanggal</span>
            <i />
          </div>
          <div className="mini-total">
            <span>Total</span>
            <strong>Rp 350.000</strong>
          </div>
          <p>{profile.note}</p>
        </div>
        <div className="profile-hint">
          <ShieldCheck size={17} />
          <span>
            Favicon diunggah akan langsung tampil di tab browser seluruh pengguna
            dan tersimpan di server. Bila dikosongkan, tab memakai logo sekolah,
            lalu ikon bawaan aplikasi sebagai pilihan terakhir.
          </span>
        </div>
      </aside>
    </div>
  );
}

export default ProfilePage;
