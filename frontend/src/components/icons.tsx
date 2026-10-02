



/**
 * Mosque silhouette used as the application emblem — the visual anchor for the
 * SDIT identity. Falls back to a school logo when the head uploads one.
 */
export function MosqueMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2.6c2.4 1.9 3.7 4 3.7 6.1 0 2-1.3 3.8-3.7 5-2.4-1.2-3.7-3-3.7-5 0-2.1 1.3-4.2 3.7-6.1Z" />
      <path d="M3.2 20.4v-6.1a8.8 8.8 0 0 1 17.6 0v6.1" />
      <path d="M2.4 20.4h19.2" />
      <path d="M10.2 20.4v-3.6a1.8 1.8 0 0 1 3.6 0v3.6" />
      <path d="M4.9 8.1V5.6M19.1 8.1V5.6" />
      <path d="M3.6 5.6h2.6M17.8 5.6h2.6" />
    </svg>
  );
}

/** Eight-point Islamic star (Rub el Hizb) used as a decorative motif. */
export function StarMotif({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2.6 14.9 9l6.4 3-6.4 3L12 21.4 9.1 15l-6.4-3 6.4-3Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}
