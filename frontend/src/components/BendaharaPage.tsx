import { useMemo, useState } from "react";
import {
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Search,
  ShieldCheck,
  ShieldOff,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { Treasurer } from "../api";
import Avatar from "./Avatar";

export type TreasurerForm = {
  name: string;
  username: string;
  email: string;
  password: string;
  password_confirmation: string;
};

const EMPTY: TreasurerForm = {
  name: "",
  username: "",
  email: "",
  password: "",
  password_confirmation: "",
};

/** Two-letter initials, falling back to a single letter for one-word names. */
function relativeTime(value: string | null): string {
  if (!value) return "Belum pernah masuk";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "Belum pernah masuk";

  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return new Date(value).toLocaleDateString("id-ID", { dateStyle: "medium" });
}

/** 0-4 strength score, mirroring the strength meter on the account page. */
function passwordScore(value: string): number {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  return score;
}

const STRENGTH_LABEL = ["Sangat lemah", "Lemah", "Cukup", "Kuat", "Sangat kuat"];

/** Which dialog is open; `confirm` guards the destructive suspend action. */
type Dialog =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; treasurer: Treasurer }
  | { kind: "password"; treasurer: Treasurer }
  | { kind: "confirm"; treasurer: Treasurer; next: boolean };
export function BendaharaPage({
  busy,
  error,
  loading,
  onCreate,
  onResetPassword,
  onToggleActive,
  onUpdate,
  treasurers,
}: {
  busy: boolean;
  error: string;
  loading: boolean;
  onCreate: (input: TreasurerForm) => void;
  onResetPassword: (treasurer: Treasurer, password: string) => void;
  onToggleActive: (treasurer: Treasurer, next: boolean) => void;
  onUpdate: (
    treasurer: Treasurer,
    input: { name: string; username: string; email: string },
  ) => void;
  treasurers: Treasurer[];
}) {
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [query, setQuery] = useState("");
  const [createForm, setCreateForm] = useState<TreasurerForm>(EMPTY);
  const [editForm, setEditForm] = useState({ name: "", username: "", email: "" });
  const [newPassword, setNewPassword] = useState("");
  const [copied, setCopied] = useState<number | null>(null);

  const activeCount = treasurers.filter((item) => item.is_active).length;
  const suspendedCount = treasurers.length - activeCount;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return treasurers;
    return treasurers.filter((item) =>
      `${item.name} ${item.username} ${item.email}`.toLowerCase().includes(needle),
    );
  }, [query, treasurers]);

  const score = passwordScore(createForm.password);
  const passwordsMatch =
    createForm.password.length > 0 &&
    createForm.password === createForm.password_confirmation;

  const close = () => setDialog({ kind: "none" });

  const submitCreate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordsMatch) return;
    onCreate(createForm);
    setCreateForm(EMPTY);
    close();
  };

  const submitEdit = (event: React.FormEvent) => {
    event.preventDefault();
    if (dialog.kind !== "edit") return;
    onUpdate(dialog.treasurer, editForm);
    close();
  };

  const submitPassword = (event: React.FormEvent) => {
    event.preventDefault();
    if (dialog.kind !== "password") return;
    onResetPassword(dialog.treasurer, newPassword);
    setNewPassword("");
    close();
  };

  const confirmToggle = () => {
    if (dialog.kind !== "confirm") return;
    onToggleActive(dialog.treasurer, dialog.next);
    close();
  };

  const copyUsername = async (treasurer: Treasurer) => {
    try {
      await navigator.clipboard.writeText(treasurer.username);
      setCopied(treasurer.id);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard is unavailable in insecure contexts; ignore silently.
    }
  };

  return (
    <div className="treasurer-content">
      <div className="metrics-grid treasurer-stats">
        <article className="metric-card">
          <div className="metric-top">
            <span>Total akun</span>
            <div className="metric-icon blue">
              <Users size={18} />
            </div>
          </div>
          <strong>
            {String(treasurers.length).padStart(2, "0")} <small>bendahara</small>
          </strong>
          <div className="metric-foot">
            <span className="metric-caption">Seluruh akun bendahara</span>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-top">
            <span>Aktif</span>
            <div className="metric-icon green">
              <ShieldCheck size={18} />
            </div>
          </div>
          <strong>
            {String(activeCount).padStart(2, "0")} <small>akun</small>
          </strong>
          <div className="metric-foot">
            <span className="metric-caption">Dapat mencatat pembayaran</span>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-top">
            <span>Nonaktif</span>
            <div className="metric-icon amber">
              <ShieldOff size={18} />
            </div>
          </div>
          <strong>
            {String(suspendedCount).padStart(2, "0")} <small>akun</small>
          </strong>
          <div className="metric-foot">
            <span className="metric-caption">
              {suspendedCount > 0 ? "Sesi lamanya sudah dicabut" : "Semua akun dapat masuk"}
            </span>
          </div>
        </article>
        <article className="metric-card metric-highlight">
          <div className="metric-top">
            <span>Peran akses</span>
            <div className="metric-icon coral">
              <KeyRound size={18} />
            </div>
          </div>
          <strong>
            Bendahara <small>saja</small>
          </strong>
          <div className="metric-foot">
            <span className="metric-caption">Data siswa &amp; pembayaran</span>
          </div>
        </article>
      </div>

      {error && <p className="form-error treasurer-error">{error}</p>}

      <section className="panel treasurer-panel">
        <div className="panel-heading">
          <div>
            <h2>Daftar bendahara</h2>
            <p>Akun yang dapat masuk dan mencatat pembayaran pada portal keuangan.</p>
          </div>
          <div className="treasurer-tools">
            <label className="search-box">
              <Search size={14} />
              <input
                type="search"
                placeholder="Cari nama atau username…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Cari bendahara"
              />
            </label>
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                setCreateForm(EMPTY);
                setDialog({ kind: "create" });
              }}
            >
              <UserPlus size={15} /> Tambah
            </button>
          </div>
        </div>
        {loading ? (
          <div className="treasurer-skeleton">
            {[0, 1, 2].map((row) => (
              <span key={row} />
            ))}
          </div>
        ) : treasurers.length === 0 ? (
          <div className="treasurer-empty">
            <div className="notice-icon">
              <UserPlus size={19} />
            </div>
            <h3>Belum ada bendahara</h3>
            <p>Tambahkan akun bendahara agar pembayaran dan data siswa dapat dikelola.</p>
            <button
              type="button"
              className="button button-primary"
              onClick={() => setDialog({ kind: "create" })}
            >
              <UserPlus size={15} /> Tambah bendahara pertama
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="treasurer-empty">
            <div className="notice-icon">
              <Search size={19} />
            </div>
            <h3>Tidak ada hasil</h3>
            <p>Tidak ada bendahara yang cocok dengan &ldquo;{query}&rdquo;.</p>
            <button type="button" className="button" onClick={() => setQuery("")}>
              Bersihkan pencarian
            </button>
          </div>
        ) : (
          <div className="treasurer-list">
            {filtered.map((treasurer) => (
              <article
                className={`treasurer-card ${treasurer.is_active ? "" : "is-suspended"}`}
                key={treasurer.id}
              >
                <Avatar
                  className="treasurer-avatar"
                  name={treasurer.name}
                  photoPath={treasurer.photo_path}
                />
                <div className="treasurer-card-main">
                  <strong>{treasurer.name}</strong>
                  <span className="treasurer-card-mail">{treasurer.email}</span>
                  <span className="treasurer-card-meta">
                    <span
                      className={`treasurer-status ${
                        treasurer.is_active ? "is-active" : "is-off"
                      }`}
                    >
                      {treasurer.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                    <i />
                    <span>{relativeTime(treasurer.last_login_at)}</span>
                  </span>
                </div>
                <button
                  type="button"
                  className="treasurer-username"
                  title="Salin username"
                  onClick={() => void copyUsername(treasurer)}
                >
                  <span>@{treasurer.username}</span>
                  {copied === treasurer.id ? <ShieldCheck size={13} /> : <Copy size={13} />}
                </button>
                <div className="treasurer-actions">
                  <button
                    type="button"
                    className="icon-button"
                    title="Ubah data"
                    onClick={() => {
                      setEditForm({
                        name: treasurer.name,
                        username: treasurer.username,
                        email: treasurer.email,
                      });
                      setDialog({ kind: "edit", treasurer });
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="Atur ulang kata sandi"
                    onClick={() => {
                      setNewPassword("");
                      setDialog({ kind: "password", treasurer });
                    }}
                  >
                    <KeyRound size={15} />
                  </button>
                  <button
                    type="button"
                    className={`icon-button ${treasurer.is_active ? "is-danger" : ""}`}
                    title={
                      treasurer.is_active ? "Nonaktifkan akun" : "Aktifkan kembali akun"
                    }
                    onClick={() =>
                      setDialog({ kind: "confirm", treasurer, next: !treasurer.is_active })
                    }
                  >
                    {treasurer.is_active ? (
                      <ShieldOff size={15} />
                    ) : (
                      <ShieldCheck size={15} />
                    )}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {dialog.kind === "create" && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <form className="modal" onSubmit={submitCreate}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">AKUN BARU</div>
                <h2>Tambah bendahara</h2>
              </div>
              <button type="button" className="icon-button" aria-label="Tutup" onClick={close}>
                <X size={19} />
              </button>
            </div>
            <div className="form-grid">
              <div className="form-field full">
                <label htmlFor="bend-nama">Nama lengkap</label>
                <input
                  id="bend-nama"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Contoh: Siti Rahmawati"
                  required
                  maxLength={255}
                />
              </div>
              <div className="form-field">
                <label htmlFor="bend-user">Username</label>
                <input
                  id="bend-user"
                  value={createForm.username}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, username: e.target.value })
                  }
                  placeholder="siti.rahma"
                  required
                  minLength={3}
                  maxLength={100}
                  pattern="[A-Za-z0-9_-]+"
                />
              </div>
              <div className="form-field">
                <label htmlFor="bend-mail">Email</label>
                <input
                  id="bend-mail"
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="siti@sekolah.sch.id"
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="bend-pass">Kata sandi</label>
                <input
                  id="bend-pass"
                  type="password"
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, password: e.target.value })
                  }
                  required
                  minLength={8}
                />
                <div className="account-strength">
                  {[0, 1, 2, 3].map((bar) => (
                    <i
                      key={bar}
                      className={bar < score ? "is-filled" : ""}
                    />
                  ))}
                  <small>{createForm.password ? STRENGTH_LABEL[score] : "Minimal 8 karakter"}</small>
                </div>
              </div>
              <div className="form-field">
                <label htmlFor="bend-pass2">Ulangi kata sandi</label>
                <input
                  id="bend-pass2"
                  type="password"
                  value={createForm.password_confirmation}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, password_confirmation: e.target.value })
                  }
                  required
                  minLength={8}
                />
                {createForm.password_confirmation && !passwordsMatch && (
                  <small className="field-mismatch">Konfirmasi kata sandi tidak sama.</small>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-outline" onClick={close}>
                Batal
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={busy || !passwordsMatch}
              >
                {busy ? <Loader2 size={16} className="spin" /> : <UserPlus size={16} />}
                Simpan akun
              </button>
            </div>
          </form>
        </div>
      )}
{dialog.kind === "edit" && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <form className="modal" onSubmit={submitEdit}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">UBAH DATA</div>
                <h2>{dialog.treasurer.name}</h2>
              </div>
              <button type="button" className="icon-button" aria-label="Tutup" onClick={close}>
                <X size={19} />
              </button>
            </div>
            <div className="form-grid">
              <div className="form-field full">
                <label htmlFor="edit-nama">Nama lengkap</label>
                <input
                  id="edit-nama"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                  maxLength={255}
                />
              </div>
              <div className="form-field">
                <label htmlFor="edit-user">Username</label>
                <input
                  id="edit-user"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  required
                  minLength={3}
                  maxLength={100}
                  pattern="[A-Za-z0-9_-]+"
                />
              </div>
              <div className="form-field">
                <label htmlFor="edit-mail">Email</label>
                <input
                  id="edit-mail"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-outline" onClick={close}>
                Batal
              </button>
              <button className="button button-primary" type="submit" disabled={busy}>
                {busy ? <Loader2 size={16} className="spin" /> : <Pencil size={16} />}
                Simpan perubahan
              </button>
            </div>
          </form>
        </div>
      )}

      {dialog.kind === "password" && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <form className="modal" onSubmit={submitPassword}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">KAMU AMAN</div>
                <h2>Atur ulang kata sandi</h2>
              </div>
              <button type="button" className="icon-button" aria-label="Tutup" onClick={close}>
                <X size={19} />
              </button>
            </div>
            <p className="modal-note">
              Sesi aktif <strong>{dialog.treasurer.name}</strong> akan dikeluarkan.(
              Berikan kata sandi ini secara pribadi.
            </p>
            <div className="form-grid">
              <div className="form-field full">
                <label htmlFor="reset-pass">Kata sandi baru</label>
                <input
                  id="reset-pass"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoFocus
                />
                <div className="account-strength">
                  {[0, 1, 2, 3].map((bar) => (
                    <i key={bar} className={bar < passwordScore(newPassword) ? "is-filled" : ""} />
                  ))}
                  <small>
                    {newPassword ? STRENGTH_LABEL[passwordScore(newPassword)] : "Minimal 8 karakter"}
                  </small>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-outline" onClick={close}>
                Batal
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={busy || newPassword.length < 8}
              >
                {busy ? <Loader2 size={16} className="spin" /> : <KeyRound size={16} />}
                Atur kata sandi
              </button>
            </div>
          </form>
        </div>
      )}

      {dialog.kind === "confirm" && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="modal" role="alertdialog" aria-modal="true">
            <div className="modal-head">
              <div>
                <div className="eyebrow">
                  {dialog.next ? "AKTIVKAN KEMBALI" : "NONAKTIFKAN AKUN"}
                </div>
                <h2>{dialog.treasurer.name}</h2>
              </div>
              <button type="button" className="icon-button" aria-label="Tutup" onClick={close}>
                <X size={19} />
              </button>
            </div>
            <p className="modal-note">
              {dialog.next ? (
                <>
                  Akun <strong>{dialog.treasurer.name}</strong> akan bisa masuk kembali dan
                  mencatat pembayaran seperti semula.
                </>
              ) : (
                <>
                  Akun <strong>{dialog.treasurer.name}</strong> tidak akan bisa masuk lagi dan
                  semua sesinya langsung dicabut. Transaksi yang pernah ia catat tetap
                  tersimpan.
                </>
              )}
            </p>
            <div className="modal-actions">
              <button type="button" className="button button-outline" onClick={close}>
                Batal
              </button>
              <button
                type="button"
                className={`button ${dialog.next ? "button-primary" : "button-danger"}`}
                onClick={confirmToggle}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 size={16} className="spin" />
                ) : dialog.next ? (
                  <ShieldCheck size={16} />
                ) : (
                  <ShieldOff size={16} />
                )}
                {dialog.next ? "Aktifkan" : "Nonaktifkan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BendaharaPage;

