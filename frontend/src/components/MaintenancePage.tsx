import { useState } from "react";
import { Database, Download, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { clearApplicationCache, downloadDatabaseBackup } from "../api";

export function MaintenancePage() {
  const [busy, setBusy] = useState<"backup" | "cache" | null>(null);
  const [confirmCacheClear, setConfirmCacheClear] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function runBackup() {
    setBusy("backup");
    setNotice("");
    setError("");

    try {
      await downloadDatabaseBackup();
      setNotice("File backup database berhasil diunduh.");
    } catch {
      setError("Backup gagal diunduh. Silakan coba lagi.");
    } finally {
      setBusy(null);
    }
  }

  async function runCacheClear() {
    setBusy("cache");
    setNotice("");
    setError("");

    try {
      const message = await clearApplicationCache();
      setNotice(message);
      setConfirmCacheClear(false);
    } catch {
      setError("Cache gagal dibersihkan. Silakan coba lagi.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="maintenance-layout">
      <section className="panel maintenance-card">
        <div className="maintenance-icon">
          <Database size={20} />
        </div>
        <div className="maintenance-card-copy">
          <span className="eyebrow">SALINAN DATA</span>
          <h2>Backup database</h2>
          <p>
            Unduh salinan struktur dan isi database dalam format SQL untuk
            disimpan sebagai cadangan.
          </p>
          <p className="maintenance-hint">
            Mendukung database MySQL dan MariaDB. File hanya dikirim
            kepada Anda dan tidak disimpan di folder publik.
          </p>
          <button
            className="button button-primary"
            onClick={() => void runBackup()}
            disabled={busy !== null}
          >
            {busy === "backup" ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <Download size={15} />
            )}
            Unduh backup
          </button>
        </div>
      </section>

      <section className="panel maintenance-card">
        <div className="maintenance-icon maintenance-icon-cache">
          <Trash2 size={20} />
        </div>
        <div className="maintenance-card-copy">
          <span className="eyebrow">PEMELIHARAAN</span>
          <h2>Bersihkan cache</h2>
          <p>
            Hapus cache aplikasi jika perubahan atau data sementara belum
            tampil dengan benar. Data transaksi dan akun tidak ikut dihapus.
          </p>
          {confirmCacheClear ? (
            <div className="maintenance-confirm">
              <span>Yakin ingin membersihkan cache aplikasi?</span>
              <button
                className="button button-outline"
                onClick={() => setConfirmCacheClear(false)}
                disabled={busy !== null}
              >
                Batal
              </button>
              <button
                className="button button-primary"
                onClick={() => void runCacheClear()}
                disabled={busy !== null}
              >
                {busy === "cache" && <Loader2 size={15} className="spin" />}
                Ya, bersihkan
              </button>
            </div>
          ) : (
            <button
              className="button button-outline"
              onClick={() => setConfirmCacheClear(true)}
              disabled={busy !== null}
            >
              <Trash2 size={15} />
              Bersihkan cache
            </button>
          )}
        </div>
      </section>

      {notice && (
        <p className="maintenance-message maintenance-success" role="status">
          <ShieldCheck size={16} />
          {notice}
        </p>
      )}
      {error && (
        <p className="maintenance-message maintenance-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default MaintenancePage;
