import { useState } from "react";
import { ArrowLeft, ArrowRight, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";
import { MosqueMark, StarMotif } from "./icons";

/**
 * Password recovery: request a link, then set a new password with it.
 *
 * The reset form never opens just because a request was sent: after
 * "Kirim tautan atur ulang" the screen parks on a "check your email" step and
 * waits for the emailed `?kode=` link, which lands here with the code already
 * filled in. The waiting step keeps an explicit manual-entry fallback for
 * mail clients that cannot open links. The server answers identically whether
 * or not the account exists, so the same steps are shown either way.
 */
export function ForgotPasswordPage({
  error,
  initialToken = "",
  logo,
  notice,
  school,
  onRequestCode,
  onReset,
  onBackToLogin,
}: {
  error: string;
  initialToken?: string;
  logo: string;
  notice: string;
  school: string;
  onRequestCode: (identifier: string) => Promise<void>;
  onReset: (token: string, password: string) => Promise<void>;
  onBackToLogin: () => void;
}) {
  const [step, setStep] = useState<"request" | "sent" | "reset">(
    initialToken ? "reset" : "request",
  );
  const [identifier, setIdentifier] = useState("");
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  const problem = localError || error;

  const submitRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setLocalError("");
    try {
      // A request only parks the screen on the waiting step: the reset form
      // opens for the emailed link (or the explicit manual fallback), never on
      // its own. Any code carried by an older link is discarded, because
      // sending a request rotates the token.
      await onRequestCode(identifier.trim());
      setToken("");
      setStep("sent");
    } finally {
      setBusy(false);
    }
  };

  // Resending from the waiting step: the screen stays parked, only a fresh
  // email (with a fresh link and code) is produced.
  const submitResend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setLocalError("");
    try {
      await onRequestCode(identifier.trim());
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError("");
    if (password.length < 8) {
      setLocalError("Kata sandi baru minimal 8 karakter.");
      return;
    }
    if (password !== confirm) {
      setLocalError("Konfirmasi kata sandi tidak sama.");
      return;
    }
    setBusy(true);
    try {
      await onReset(token.trim(), password);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-visual" aria-label={school}>
        <div className="login-visual-grid" />
        <div className="login-school-lockup">
          <div className="login-emblem">
            {logo ? <img src={logo} alt="" /> : <MosqueMark size={25} />}
          </div>
          <div>
            <strong>{school}</strong>
            <span>SDIT · PORTAL KEUANGAN</span>
          </div>
        </div>
        <div className="login-visual-copy">
          <span className="login-kicker"><StarMotif size={13} /> SEKOLAH DASAR ISLAM TERPADU</span>
          <h1>
            {step === "reset" ? (
              <>Kata sandi <em>baru.</em></>
            ) : (
              <>Pemulihan <em>akun.</em></>
            )}
          </h1>
          <p>
            {step === "request"
              ? "Masukkan username atau email. Tautan atur ulang dikirim ke email terdaftar."
              : step === "sent"
                ? "Tautan sudah dikirim. Buka email, lalu klik tautannya untuk melanjutkan."
                : "Gunakan kode dari email untuk membuat kata sandi baru."}
          </p>
        </div>
        <div className="login-ledger" aria-hidden="true">
          <div className="ledger-heading"><span>RINGKASAN BULANAN</span><span>2026 — 2027</span></div>
          <div className="ledger-bars"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          <div className="ledger-months"><span>JUL</span><span>SEP</span><span>NOV</span><span>JAN</span><span>MAR</span><span>MEI</span></div>
        </div>
        <span className="login-visual-index" aria-hidden="true">01 / 03</span>
      </section>

      <section className="login-content">
        <div className="login-card">
          <span className="login-mobile-brand"><i /> {school}</span>
          <span className="login-overline">PEMULIHAN AKUN</span>
          <h2>
            {step === "request"
              ? "Lupa kata sandi?"
              : step === "sent"
                ? "Cek email Anda"
                : "Buat kata sandi baru"}
          </h2>
          <p className="login-intro">
            {step === "request"
              ? "Kami akan mengirim tautan atur ulang ke email akun Anda."
              : step === "sent"
                ? "Halaman kata sandi baru terbuka setelah tautan di email diklik."
                : "Masukkan kode yang kami kirim, lalu pilih kata sandi baru."}
          </p>

          {step === "request" ? (
            <form className="login-form" onSubmit={submitRequest}>
              <div className="login-field">
                <label htmlFor="recover-email">Email</label>
                <div className="login-password-wrap">
                  <input
                    id="recover-email"
                    type="email"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="admin@sekolah.sch.id"
                    autoCapitalize="none"
                    required
                  />
                  <Mail size={16} />
                </div>
              </div>
              {problem && <p className="login-error" role="alert">{problem}</p>}
              <button className="login-submit" type="submit" disabled={busy}>
                {busy ? "Mengirim..." : "Kirim tautan atur ulang"}
                <ArrowRight size={17} />
              </button>
            </form>
          ) : step === "sent" ? (
            <form className="login-form" onSubmit={submitResend}>
              {problem && <p className="login-error" role="alert">{problem}</p>}
              {notice && <p className="login-notice" role="status">{notice}</p>}
              <button className="login-submit" type="submit" disabled={busy}>
                {busy ? <Loader2 size={17} className="spin" /> : <Mail size={17} />}
                {busy ? "Mengirim ulang..." : "Kirim ulang tautan"}
              </button>
              <button className="login-back" type="button" onClick={() => setStep("request")}>
                <ArrowLeft size={13} /> Ganti email
              </button>
              <button
                className="login-back"
                type="button"
                onClick={() => {
                  setToken("");
                  setStep("reset");
                }}
              >
                Tautan tidak bisa diklik? Masukkan kode manual <ArrowRight size={13} />
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={submitReset}>
              <div className="login-field">
                <label htmlFor="reset-token">Kode dari email</label>
                <div className="login-password-wrap">
                  <input
                    id="reset-token"
                    type="password"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="Kode 64 karakter"
                    autoCapitalize="none"
                    required
                  />
                  <KeyRound size={16} />
                </div>
              </div>
              <div className="login-field">
                <label htmlFor="new-password">Kata sandi baru</label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div className="login-field">
                <label htmlFor="confirm-password">Ulangi kata sandi</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              {problem && <p className="login-error" role="alert">{problem}</p>}
              {notice && <p className="login-notice" role="status">{notice}</p>}
              <button className="login-submit" type="submit" disabled={busy}>
                {busy ? <Loader2 size={17} className="spin" /> : <KeyRound size={17} />}
                Simpan kata sandi baru
              </button>
              <button className="login-back" type="button" onClick={() => setStep("request")}>
                <ArrowLeft size={13} /> Kirim ulang kode
              </button>
            </form>
          )}

          <div className="login-secure">
            <ShieldCheck size={15} />
            <span>Kode hanya berlaku sementara dan hanya untuk akun ini.</span>
          </div>
        </div>
        <button className="login-back login-back-solid" type="button" onClick={onBackToLogin}>
          <ArrowLeft size={14} /> Kembali ke halaman masuk
        </button>
        <footer className="login-footer"><span>© 2026 {school}</span><span>Butuh bantuan? Hubungi administrator sekolah.</span></footer>
      </section>
    </main>
  );
}

export default ForgotPasswordPage;
