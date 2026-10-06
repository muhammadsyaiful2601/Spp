import { useState } from "react";
import { ArrowLeft, ArrowRight, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";
import { MosqueMark, StarMotif } from "./icons";

/**
 * Password recovery: request a code, then set a new password with it.
 *
 * Both steps share one screen so a user holding only the email never has to
 * hunt for a second URL. The server answers identically whether or not the
 * account exists, so the "sent" state is shown either way. Arriving from the
 * emailed `?kode=` link skips the request step and lands here with the code
 * already filled in.
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
  const [step, setStep] = useState<"request" | "reset">(initialToken ? "reset" : "request");
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
      // The token field is never prefilled: a code shown in the browser is a
      // code that can be read over someone's shoulder or captured in a
      // screenshot. It is typed from the email like any other code.
      await onRequestCode(identifier.trim());
      setToken("");
      setStep("reset");
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
            {step === "request" ? (
              <>Pemulihan <em>akun.</em></>
            ) : (
              <>Kata sandi <em>baru.</em></>
            )}
          </h1>
          <p>
            {step === "request"
              ? "Masukkan username atau email. Kode atur ulang dikirim ke email terdaftar."
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
          <h2>{step === "request" ? "Lupa kata sandi?" : "Buat kata sandi baru"}</h2>
          <p className="login-intro">
            {step === "request"
              ? "Kami akan mengirim kode verifikasi ke email akun Anda."
              : "Masukkan kode yang kami kirim, lalu pilih kata sandi baru."}
          </p>

          {step === "request" ? (
            <form className="login-form" onSubmit={submitRequest}>
              <div className="login-field">
                <label htmlFor="recover-id">Username atau email</label>
                <div className="login-password-wrap">
                  <input
                    id="recover-id"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="admin atau admin@sekolah.sch.id"
                    autoCapitalize="none"
                    required
                  />
                  <Mail size={16} />
                </div>
              </div>
              {problem && <p className="login-error" role="alert">{problem}</p>}
              {notice && <p className="login-notice" role="status">{notice}</p>}
              <button className="login-submit" type="submit" disabled={busy}>
                {busy ? "Mengirim..." : "Kirim kode atur ulang"}
                <ArrowRight size={17} />
              </button>
              {notice && (
                <button
                  className="login-back"
                  type="button"
                  onClick={() => setStep("reset")}
                >
                  Sudah punya kode? <ArrowRight size={13} />
                </button>
              )}
            </form>
          ) : (
            <form className="login-form" onSubmit={submitReset}>
              <div className="login-field">
                <label htmlFor="reset-token">Kode dari email</label>
                <div className="login-password-wrap">
                  <input
                    id="reset-token"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="Kode 64 karakter"
                    autoCapitalize="characters"
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
