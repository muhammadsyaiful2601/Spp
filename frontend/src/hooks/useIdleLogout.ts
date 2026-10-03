import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearSessionActivity,
  IDLE_CHECK_INTERVAL,
  IDLE_WARNING_MS,
  isSessionExpired,
  sessionRemaining,
  startSession,
  touchSession,
} from "../lib/session";

/** Events that count as the user still being present. */
const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
] as const;

/** Ignore bursts: writing on every mousemove would hammer localStorage. */
const THROTTLE_MS = 5_000;

/**
 * End the session automatically after a period of inactivity.
 *
 * Three things are watched:
 *  - user activity, which restarts the idle countdown;
 *  - a timer, which signs the user out once the limit passes;
 *  - the `storage` event, so signing out in one tab signs out every other tab
 *    instead of leaving a half-authenticated window behind.
 *
 * Returns the time left before expiry and a `keepAlive` action, so the caller
 * can warn before the sign-out instead of letting it happen silently.
 *
 * `onExpire` is expected to be stable; it is read through a ref so re-renders
 * do not re-register the listeners.
 */
export function useIdleLogout(
  active: boolean,
  onExpire: () => void,
): { remainingMs: number | null; keepAlive: () => void } {
  const onExpireRef = useRef(onExpire);

  // Synced in an effect rather than during render: writing `ref.current` while
  // rendering is flagged by the react(refs) rule and can strand a stale closure.
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  const lastWrite = useRef(0);
  // Read once at mount rather than setting it from the effect below, which would
  // be a redundant first render.
  const [remainingMs, setRemainingMs] = useState<number | null>(() =>
    sessionRemaining(),
  );

  const keepAlive = useCallback(() => {
    touchSession();
    setRemainingMs(sessionRemaining());
  }, []);

  useEffect(() => {
    if (!active) return;

    // Opening a page is itself activity: without this a reload would look idle.
    startSession();

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastWrite.current < THROTTLE_MS) return;
      lastWrite.current = now;
      touchSession();
      setRemainingMs(sessionRemaining(now));
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, recordActivity, { passive: true });
    }

    const timer = window.setInterval(() => {
      if (isSessionExpired()) {
        clearSessionActivity();
        onExpireRef.current();
        return;
      }
      // Only refresh the countdown state while it is on screen, so a routine
      // session does not re-render the app every few seconds.
      setRemainingMs((current) => {
        const left = sessionRemaining();
        if (left === null) return current;
        return left < IDLE_WARNING_MS ? left : current;
      });
    }, IDLE_CHECK_INTERVAL);

    // Another tab removed the token, so this one must follow it out.
    const onStorage = (event: StorageEvent) => {
      if (event.key === "cendekia-token" && !event.newValue) {
        clearSessionActivity();
        onExpireRef.current();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, recordActivity);
      }
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
  }, [active]);

  return { remainingMs, keepAlive };
}

export default useIdleLogout;