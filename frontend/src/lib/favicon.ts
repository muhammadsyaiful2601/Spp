const defaultFavicon = "/favicon.svg";

/** Best-effort MIME type for a favicon source so browsers render it correctly. */
function faviconMimeType(source: string): string {
  if (!source || source.startsWith("data:")) return "image/png";
  const extension =
    source.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() ?? "";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "ico") return "image/x-icon";
  return "image/png";
}

export function faviconErrorMessage(error: unknown): string {
  const response = error && typeof error === "object" && "response" in error
    ? (error as { response?: { status?: number; data?: { errors?: { favicon?: string[] } } } }).response
    : undefined;
  const validation = response?.data?.errors?.favicon;
  if (Array.isArray(validation) && validation.length > 0) {
    return String(validation[0]);
  }
  if (response?.status === 403) {
    return "Hanya pimpinan yang dapat mengubah favicon.";
  }
  if (response?.status === 401) {
    return "Sesi Anda berakhir. Silakan masuk kembali.";
  }
  if (error instanceof TypeError || !response) {
    return "Server branding tidak dapat dihubungi. Coba lagi beberapa saat.";
  }
  return "Favicon gagal disimpan. Silakan coba kembali.";
}

/**
 * Point the document favicon at the school upload, falling back to the school
 * logo and finally the bundled default icon.
 */
export function applyFavicon(source: string, logo = ""): string {
  const target = source || logo || defaultFavicon;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = faviconMimeType(target);
  if (link.href !== new URL(target, window.location.origin).toString()) {
    link.href = target;
  }
  return target;
}
