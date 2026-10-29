import { useEffect, useState } from "react";
import { closeOverlay } from "../lib/ui";
import { Overlay } from "./ui";

const inputClass =
  "h-7 rounded-md bg-canvas px-2 text-body text-ink shadow-[inset_0_0_0_1px_var(--cal-edge)] outline-none focus:shadow-[inset_0_0_0_1px_var(--cal-accent)]";

// Google's "G" in its four colors, for the sign-in button.
function GoogleMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A8.65 8.65 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/*
 * Sign in with Google. The button opens the browser; Cal hears back through its URL
 * scheme and the sheet closes when the account changes. Development builds can't be
 * opened by links, so the browser page shows a code to paste here instead.
 */
export function SignInSheet() {
  const [waiting, setWaiting] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stopAuth = window.cal.auth.onChange((state) => {
      if (state.status === "signedIn") closeOverlay();
    });
    const stopError = window.cal.auth.onError((message) => {
      setWaiting(false);
      setError(message);
    });
    return () => {
      stopAuth();
      stopError();
    };
  }, []);

  const startGoogle = async () => {
    setError(null);
    setWaiting(true);
    try {
      await window.cal.auth.signInWithGoogle();
    } catch (failure) {
      setWaiting(false);
      setError(failure instanceof Error ? failure.message : "Couldn't open the browser.");
    }
  };

  const submitCode = async () => {
    if (!code.trim()) return;
    setError(null);
    try {
      await window.cal.auth.submitCode(code.trim());
      closeOverlay();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That code didn't work.");
    }
  };

  return (
    <Overlay onClose={closeOverlay} width={400} kind="sheet" label="Sign in">
      <div className="flex flex-col gap-3 p-6">
        <h2 className="text-title-3 font-semibold text-ink">Sign in to sync</h2>
        <p className="text-small text-ink-2">
          Your to-dos, blocks and habits stay on this Mac until you sign in. Then they sync to your
          other devices.
        </p>
        <button
          type="button"
          // biome-ignore lint/a11y/noAutofocus: the sheet opens to sign in.
          autoFocus
          onClick={() => void startGoogle()}
          className="mt-1 flex h-8 items-center justify-center gap-2 rounded-md bg-canvas text-body font-medium text-ink shadow-[inset_0_0_0_1px_var(--cal-edge)] hover:bg-hover"
        >
          <GoogleMark />
          {waiting ? "Waiting for the browser…" : "Continue with Google"}
        </button>
        {waiting && (
          <form
            className="flex flex-col gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              void submitCode();
            }}
          >
            <label className="flex flex-col gap-1 text-small text-ink-2">
              Browser showing a code? Paste it here.
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                spellCheck={false}
                className={inputClass}
              />
            </label>
          </form>
        )}
        {error && <p className="text-small text-now">{error}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeOverlay}
            className="h-7 rounded-md px-3 text-small font-medium text-ink shadow-[inset_0_0_0_1px_var(--cal-edge)] hover:bg-hover"
          >
            Cancel
          </button>
          {waiting && code.trim() && (
            <button
              type="button"
              onClick={() => void submitCode()}
              className="h-7 rounded-md bg-accent-solid px-3 text-small font-medium text-white"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </Overlay>
  );
}
