import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Clock, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";
import { MosqueMark, StarMotif } from "./icons";

/**
 * Password recovery: request a link, then set a new password with it.
 *
 * The reset form never opens just because a request was sent: after
 * "Kirim tautan atur ulang" the screen parks on a "check your email" step and
 * waits for the emailed `?kode=` link, which lands here and opens the form with
 * that link as the only way in.
 *
 * There is deliberately no box to paste the code into. The code is 64
 * characters of bearer authority: typed by hand it passes through the screen,
 * the browser's form-history and autocomplete, and any support screenshot, and
 * whoever reads it owns the account outright. Opening the emailed link keeps it
 * out of the page, and the server still only honours it while the token is
 * unexpired and unused. The server answers identically whether or not the
 * account exists, so the same steps are shown either way.
 */
export function ForgotPasswordPage({
  error,
  expiresAt = 0,
  initialToken = "",
  logo,
  notice,
  school,
  onRequestCode,
  onReset,
  onBackToLogin,
}: {
  error: string;
  /**
   * Unix seconds when the emailed token stops being accepted, as stamped into
   * the link by the notification. `0` means the link carried no deadline (a mail
   * from before this existed) and the screen then shows no countdown at all —
   * guessing one would be worse than staying quiet.
   */
  expiresAt?: number;
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
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [confirmed, setConfirmed] = useState({ owner: false, sessions: false, reused: false });

  // Ticks once a second only while a deadline exists, so the timer cannot drift
  // away from the real one and leave the user submitting a link that is already
  // dead. The value is display-only: the endpoint still decides what is valid.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const secondsLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt * 1000 - now) / 1000)) : 0;
  const expired = Boolean(expiresAt) && secondsLeft === 0;
  const confirmedAll = confirmed.owner && confirmed.sessions && confirmed.reused;

  const minutes = Math.floor(secondsLeft / 60);
  const clock = `${String(minutes).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;

  // Each link gets its own confirmations, so leaving the reset step clears them.
  // Done in the handler rather than an effect: the ticks are about one specific
  // attempt, and the user leaving the step is what invalidates them.
  const backToRequest = () => {
    setConfirmed({ owner: false, sessions: false, reused: false });
    setStep("request");
  };

  const problem = localError || error;

  const submitRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setLocalError("");
    try {
      // A request only parks the screen on the waiting step: the reset form
      // opens for the emailed link, never on its own. Requesting rotates the
      // token server-side, so a link already open on screen stops working and
      // the new email becomes the only way back in.
      await onRequestCode(identifier.trim());
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
    // Reachable only through an emailed link, but a stripped or malformed query
    // must not be sent on as an empty code.
    if (!initialToken) {
      setLocalError("Tautan atur ulang tidak lengkap. Minta tautan baru.");
      return;
    }
    if (expired) {
      setLocalError("Tautan atur ulang sudah kedaluwarsa. Minta tautan baru.");
      return;
    }
    if (!confirmedAll) {
      setLocalError("Selesaikan seluruh konfirmasi sebelum menyimpan.");
      return;
    }
    setBusy(true);
    try {
      await onReset(initialToken, password);
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
                : "Tautan yang Anda buka sudah membawa kodenya. Pilih kata sandi baru untuk melanjutkan."}
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
                : "Pilih kata sandi baru untuk akun ini."}
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
                {busy ? "Mengirim ulang..." : "Kirim ulang tautan"}
                {busy ? <Loader2 size={17} className="spin" /> : <Mail size={17} />}
              </button>
              <button className="login-back" type="button" onClick={() => setStep("request")}>
                <ArrowLeft size={13} /> Ganti email
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={submitReset}>
              {expiresAt > 0 && (
                <p className={expired ? "login-deadline is-over" : "login-deadline"}>
                  {expired ? (
                    <><AlertTriangle size={14} /> Tautan sudah kedaluwarsa. Minta tautan baru untuk melanjutkan.</>
                  ) : (
                    <>
                      <Clock size={14} />
                      Tautan berlaku <strong>{clock}</strong> lagi. Setelah itu kode tidak lagi diterima.
                    </>
                  )}
                </p>
              )}
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
              <fieldset className="login-confirm" disabled={expired}>
                <legend>Sebelum menyimpan, pastikan:</legend>
                <label className="login-check">
                  <input
                    type="checkbox"
                    checked={confirmed.owner}
                    onChange={(e) => setConfirmed({ ...confirmed, owner: e.target.checked })}
                  />
                  <span>Saya sendiri yang meminta atur ulang kata sandi ini.</span>
                </label>
                <label className="login-check">
                  <input
                    type="checkbox"
                    checked={confirmed.sessions}
                    onChange={(e) => setConfirmed({ ...confirmed, sessions: e.target.checked })}
                  />
                  <span>Saya paham seluruh sesi di perangkat lain akan dikeluarkan.</span>
                </label>
                <label className="login-check">
                  <input
                    type="checkbox"
                    checked={confirmed.reused}
                    onChange={(e) => setConfirmed({ ...confirmed, reused: e.target.checked })}
                  />
                  <span>Kata sandi baru ini berbeda dari kata sandi lama.</span>
                </label>
              </fieldset>
              <button className="login-submit" type="submit" disabled={busy || expired}>
                {expired ? "Tautan kedaluwarsa" : busy ? "Menyimpan..." : "Simpan kata sandi baru"}
                {expired ? <AlertTriangle size={17} /> : busy ? <Loader2 size={17} className="spin" /> : <KeyRound size={17} />}
              </button>
              <button className="login-back" type="button" onClick={backToRequest}>
                <ArrowLeft size={13} /> Kirim ulang tautan
              </button>
            </form>
          )}

          <div className="login-secure">
            <ShieldCheck size={15} />
            <span>Kode pada tautan ini hanya berlaku sementara dan hanya untuk akun ini.</span>
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
