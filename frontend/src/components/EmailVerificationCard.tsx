import { useState } from "react";
import { BadgeCheck, Loader2, MailCheck, Send, ShieldAlert } from "lucide-react";

/**
 * Email verification panel for the profile screen.
 *
 * While an account is unverified this is the only way into the rest of the
 * portal, so it explains what is blocked rather than just offering a form.
 */
export function EmailVerificationCard({
  busy,
  email,
  emailDirty,
  error,
  notice,
  verified,
  onChangeEmail,
  onSaveEmail,
  onSendCode,
  onVerify,
}: {
  busy: boolean;
  email: string;
  /** True while the typed address differs from the stored one. */
  emailDirty: boolean;
  error: string;
  notice: string;
  verified: boolean;
  onChangeEmail: (value: string) => void;
  onSaveEmail: () => void;
  onSendCode: () => void;
  onVerify: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);

  /**
   * The code is wiped only when the server confirms, never on submit.
   *
   * Clearing it on click threw away a correctly typed six-digit code the moment
   * anything went wrong, forcing the user to read it back off the email and
   * type it again — and re-reading is exactly how the wrong code gets typed.
   *
   * Done during render rather than in an effect: when `verified` flips the card
   * stops rendering the input altogether, so the only case worth handling is
   * going back to unverified, where a stale code would still be sitting there.
   */
  const [wasVerified, setWasVerified] = useState(verified);
  if (verified !== wasVerified) {
    setWasVerified(verified);
    if (verified) setCode("");
  }

  if (verified) {
    return (
      <section className="panel verify-panel is-verified">
        <div className="verify-icon">
          <BadgeCheck size={19} />
        </div>
        <div className="verify-body">
          <strong>Email terverifikasi</strong>
          <span>{email} sudah dikonfirmasi. Seluruh fitur portal aktif.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="panel verify-panel">
      <div className="verify-icon is-warning">
        <ShieldAlert size={19} />
      </div>
      <div className="verify-body">
        <strong>Verifikasi alamat email</strong>
        <span>
          Fitur lain masih dinonaktifkan. Pastikan alamat di bawah benar dan bisa
          menerima email, lalu kirim kode untuk mengaktifkan portal.
        </span>

        <div className="verify-email">
          <label htmlFor="verify-email">Alamat email</label>
          <input
            id="verify-email"
            type="email"
            value={email}
            onChange={(event) => onChangeEmail(event.target.value)}
            placeholder="nama@sekolah.sch.id"
            disabled={busy}
          />
          <button
            type="button"
            className="button"
            disabled={busy || !emailDirty}
            onClick={onSaveEmail}
          >
            Simpan
          </button>
        </div>

        <div className="verify-form">
          <label>
            <span>Kode verifikasi</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="6 digit"
              maxLength={6}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            className="button button-primary"
            // Sending before saving would mail the old address.
            disabled={busy || code.length !== 6 || emailDirty}
            onClick={() => {
              onVerify(code);
            }}
          >
            {busy ? <Loader2 size={15} className="spin" /> : <MailCheck size={15} />}
            Verifikasi
          </button>
          <button
            type="button"
            className="button"
            disabled={busy || emailDirty}
            onClick={() => {
              setSent(true);
              onSendCode();
            }}
          >
            <Send size={14} />
            {sent ? "Kirim ulang" : "Kirim kode"}
          </button>
        </div>

        {emailDirty && (
          <p className="verify-hint">Simpan alamat baru sebelum meminta kode.</p>
        )}
        {notice && <p className="login-notice" role="status">{notice}</p>}
        {error && <p className="login-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}

export default EmailVerificationCard;