import { useState } from "react";
import { avatarUrl } from "../api";
import { initialsOf, toneOf } from "../lib/avatar";

/**
 * Avatar used everywhere a profile is shown.
 *
 * Renders the uploaded photo when one exists and falls back to initials, so no
 * screen ever shows a broken image. If the file fails to load the component
 * falls back to initials as well, which covers a photo deleted on the server.
 */
export function Avatar({
  className = "",
  name,
  photoPath,
  style,
}: {
  className?: string;
  name: string;
  photoPath?: string | null;
  style?: React.CSSProperties;
}) {
  // Track which URL failed rather than a boolean, so replacing the photo with a
  // different one automatically renders again without an effect resetting state.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = photoPath ? avatarUrl(photoPath) : "";
  const showPhoto = Boolean(url) && failedUrl !== url;

  if (showPhoto) {
    return (
      <span className={`avatar-photo ${className}`} style={style}>
        <img src={url} alt={name} onError={() => setFailedUrl(url)} />
      </span>
    );
  }

  return (
    <span
      className={`avatar-initials ${className}`}
      style={style ?? { background: `hsl(${toneOf(name)} 34% 42%)` }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}

export default Avatar;