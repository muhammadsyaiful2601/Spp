





export function LoadingScreen({
  school,
  logo,
  message,
}: {
  school: string;
  logo: string;
  message: string;
}) {
  const initials = school
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

  return (
    <main className="loading-shell" role="status" aria-live="polite">
      <div className="loading-mark">
        {logo ? <img src={logo} alt="" /> : <span>{initials || "SD"}</span>}
      </div>
      <strong>{school}</strong>
      <span className="loading-caption">PORTAL KEUANGAN SEKOLAH</span>
      <div className="loading-spinner" aria-hidden="true" />
      <p>{message}</p>
      <div className="loading-track" aria-hidden="true"><i /></div>
    </main>
  );
}

export default LoadingScreen;
