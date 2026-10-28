import { useState } from "react";
import type { SignInFlow } from "../../../shared/api";
import { closeOverlay } from "../lib/ui";
import { Overlay } from "./ui";

// A Mac-style sheet for Convex Auth email and password: sign in, or create an account.
export function SignInSheet() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<SignInFlow | null>(null);

  const submit = async (flow: SignInFlow) => {
    if (!email || !password || busy) return;
    setBusy(flow);
    setError(null);
    try {
      await window.cal.auth.signIn(email.trim(), password, flow);
      closeOverlay();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn't sign in. Check the email and password.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Overlay onClose={closeOverlay} width={400} kind="sheet" label="Sign in">
      <form
        className="flex flex-col gap-3 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit("signIn");
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeOverlay();
          }
        }}
      >
        <h2 className="text-title-3 font-semibold text-ink">Sign in to sync</h2>
        <p className="text-small text-ink-2">
          Your to-dos, blocks and habits stay on this Mac until you sign in. Then they sync to your
          other devices.
        </p>
        <label className="flex flex-col gap-1 text-small text-ink-2">
          Email
          <input
            // biome-ignore lint/a11y/noAutofocus: the sheet opens to be filled in.
            autoFocus
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            className="h-7 rounded-md bg-canvas px-2 text-body text-ink shadow-[inset_0_0_0_1px_var(--cal-edge)] outline-none focus:shadow-[inset_0_0_0_1px_var(--cal-accent)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-small text-ink-2">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="h-7 rounded-md bg-canvas px-2 text-body text-ink shadow-[inset_0_0_0_1px_var(--cal-edge)] outline-none focus:shadow-[inset_0_0_0_1px_var(--cal-accent)]"
          />
        </label>
        {error && <p className="text-small text-now">{error}</p>}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void submit("signUp")}
            disabled={busy !== null}
            className="h-7 rounded-md px-3 text-small font-medium text-ink-2 hover:bg-hover disabled:opacity-50"
          >
            {busy === "signUp" ? "Creating…" : "Create account"}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={closeOverlay}
            className="h-7 rounded-md px-3 text-small font-medium text-ink shadow-[inset_0_0_0_1px_var(--cal-edge)] hover:bg-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy !== null}
            className="h-7 rounded-md bg-accent-solid px-3 text-small font-medium text-white disabled:opacity-50"
          >
            {busy === "signIn" ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </Overlay>
  );
}
