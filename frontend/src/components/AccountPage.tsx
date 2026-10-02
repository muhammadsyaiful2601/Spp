import { useState } from "react";
import { Check, Clock, LogOut, RefreshCw, ShieldCheck, UserCog } from "lucide-react";
import type { AuthUser, AccountDetails } from "../api";



export function AccountPage({
  account,
  fallback,
  loading,
  busy,
  error,
  passwordError,
  passwordNotice,
  onSave,
  onChangePassword,
  onLogout,
}: {
  account?: AccountDetails;
  fallback: AuthUser;
  loading: boolean;
  busy: boolean;
  error: string;
  passwordError: string;
  passwordNotice: string;
  onSave: (name: string, email: string) => void;
  onChangePassword: (input: {
    current_password: string;
    password: string;
    password_confirmation: string;
  }) => void;
  onLogout: () => void;
}) {
  // Until `/auth/me` resolves, render from the session copy so the page is never
  // blank. `username` is only a placeholder until the server value arrives.
  const user: AccountDetails = account ?? {
    id: fallback.id,
    name: fallback.name,
    email: fallback.email,
    role: fallback.role,
    username: fallback.name.toLowerCase().replace(/\s+/g, "."),
    created_at: null,
  };
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const roleLabel =
    user.role === "pimpinan" ? "Pimpinan Sekolah" : "Admin Keuangan";

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFormError, setPasswordFormError] = useState("");

  // Re-seed the editable fields once the real account arrives from the API.
  const [syncedWith, setSyncedWith] = useState("");
  if (user.email !== syncedWith) {
    setSyncedWith(user.email);
    setName(user.name);
    setEmail(user.email);
  }

  const dirty = name !== user.name || email !== user.email;
  const joined = user.created_at
    ? new Date(user.created_at).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Akun portal keuangan sekolah";

  function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;
    onSave(name.trim(), email.trim());
  }

  function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordFormError("");
    if (newPassword.length < 8) {
      setPasswordFormError("Kata sandi baru minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFormError("Konfirmasi kata sandi tidak sama.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordFormError("Kata sandi baru harus berbeda dari yang lama.");
      return;
    }
    onChangePassword({
      current_password: currentPassword,
      password: newPassword,
      password_confirmation: confirmPassword,
    });
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="account-layout">
      <section className="panel account-card">
        <div className="panel-heading">
          <div>
            <h2>Identitas akun</h2>
            <p>Data ini hanya untuk akun Anda, tidak memengaruhi data sekolah.</p>
          </div>
          <div className="metric-icon green">
            <UserCog size={17} />
          </div>
        </div>

        <div className="account-hero">
          <div className="account-hero-avatar">{initials}</div>
          <div className="account-hero-text">
            <strong>{user.name}</strong>
            <span>{roleLabel}</span>
            <div className="account-tags">
              <span className="account-tag">@{user.username}</span>
              <span className="account-tag is-role">
                {user.role === "pimpinan" ? "Akses penuh" : "Akses operasional"}
              </span>
            </div>
          </div>
        </div>

        <form className="account-form" onSubmit={submitProfile}>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="account-name">Nama lengkap</label>
              <input
                id="account-name"
                value={name}
                disabled={loading || busy}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="account-email">Email</label>
              <input
                id="account-email"
                type="email"
                value={email}
                disabled={loading || busy}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="form-field full">
              <label htmlFor="account-username">Username</label>
              <input id="account-username" value={user.username} readOnly />
              <small className="field-hint">
                Username hanya dapat diubah oleh pimpinan sekolah.
              </small>
            </div>
          </div>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <div className="profile-actions">
            <span>Bergabung {joined}</span>
            <button
              type="submit"
              className="button button-primary"
              disabled={loading || busy || !dirty}
            >
              {busy ? <RefreshCw size={15} /> : <Check size={15} />}
              {busy ? "Menyimpan" : "Simpan perubahan"}
            </button>
          </div>
        </form>
      </section>

      <div className="account-side">
        <section className="panel account-card">
          <div className="panel-heading">
            <div>
              <h2>Ubah kata sandi</h2>
              <p>Gunakan minimal 8 karakter.</p>
            </div>
            <div className="metric-icon amber">
              <ShieldCheck size={17} />
            </div>
          </div>

          <form className="account-form" onSubmit={submitPassword}>
            <div className="form-field">
              <label htmlFor="current-password">Kata sandi saat ini</label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                disabled={busy}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="new-password">Kata sandi baru</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                disabled={busy}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
              <div className="account-strength">
                {[0, 1, 2, 3].map((step) => (
                  <i
                    key={step}
                    className={
                      newPassword.length >= (step + 1) * 2 ? "is-filled" : ""
                    }
                  />
                ))}
                <small>{newPassword.length}/8 minimal</small>
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="confirm-password">Ulangi kata sandi baru</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                disabled={busy}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>

            {(passwordFormError || passwordError) && (
              <p className="login-error" role="alert">
                {passwordFormError || passwordError}
              </p>
            )}
            {passwordNotice && !passwordError && !passwordFormError && (
              <p className="account-success" role="status">
                {passwordNotice}
              </p>
            )}

            <div className="profile-actions">
              <span>Sesi di perangkat lain dikeluarkan.</span>
              <button
                type="submit"
                className="button button-primary"
                disabled={busy || !currentPassword || !newPassword}
              >
                {busy ? <RefreshCw size={15} /> : <ShieldCheck size={15} />}
                {busy ? "Menyimpan" : "Ubah kata sandi"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel account-card">
          <div className="panel-heading">
            <div>
              <h2>Sesi perangkat</h2>
              <p>Status masuk Anda saat ini.</p>
            </div>
            <div className="metric-icon blue">
              <Clock size={17} />
            </div>
          </div>
          <ul className="account-session-list">
            <li>
              <Check size={14} />
              <span>Sesi tersimpan di browser ini</span>
            </li>
            <li>
              <Check size={14} />
              <span>Tetap aktif saat berpindah tab</span>
            </li>
            <li>
              <Check size={14} />
              <span>Sesi lain berakhir bila kata sandi diubah</span>
            </li>
          </ul>
          <button
            type="button"
            className="button button-ghost account-logout"
            onClick={onLogout}
          >
            <LogOut size={15} /> Keluar dari perangkat ini
          </button>
        </section>
      </div>
    </div>
  );
}

export default AccountPage;
