import { useState } from "react";
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { MosqueMark, StarMotif } from "./icons";



export function LoginPage({
  school,
  logo,
  error,
  onSubmit,
}: {
  school: string;
  logo: string;
  error: string;
  onSubmit: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(username, password);
    } finally {
      setSubmitting(false);
    }
  }

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
          <h1>Selamat Datang<br />di portal <em>keuangan.</em></h1>
          <p>Ruang kerja keuangan sekolah untuk tahun ajaran 2026 / 2027.</p>
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
          <span className="login-overline">AKSES AKUN</span>
          <h2>Masuk ke akun Anda</h2>
          <p className="login-intro">Gunakan username dan kata sandi yang terdaftar.</p>
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="login-username">Username</label>
              <input
                id="login-username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Masukkan username"
                required
              />
            </div>
            <div className="login-field">
              <label htmlFor="login-password">Kata sandi</label>
              <div className="login-password-wrap">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Masukkan kata sandi"
                  required
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  title={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="login-submit" type="submit" disabled={submitting}>
              {submitting ? "Memverifikasi..." : "Masuk ke portal"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="login-secure"><ShieldCheck size={15} /><span>Akses aman · sesi berakhir saat tab ditutup</span></div>
        </div>
        <footer className="login-footer"><span>© 2026 {school}</span><span>Butuh bantuan? Hubungi administrator sekolah.</span></footer>
      </section>
    </main>
  );
}

export default LoginPage;
