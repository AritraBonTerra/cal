import type { AuthState, SyncStatus } from "../../../../shared/api";
import { closeOverlay, toggleOverlay } from "../../lib/ui";
import { Group, Row, RowButton } from "./controls";

// Account: the signed-in user and sync state. Sign-in itself lives in its own sheet.
export function AccountSection({ auth, sync }: { auth: AuthState; sync: SyncStatus }) {
  if (auth.status === "signedOut") {
    return (
      <Group title="Sync">
        <Row
          label="Not signed in"
          note="To-dos, blocks and habits stay on this Mac until you sign in"
        >
          <RowButton
            onClick={() => {
              closeOverlay();
              toggleOverlay("signIn");
            }}
          >
            Sign in…
          </RowButton>
        </Row>
      </Group>
    );
  }
  const status = sync.needsSignIn
    ? "Sign in again to keep syncing"
    : !sync.connected
      ? sync.pending > 0
        ? `Offline · ${sync.pending} change${sync.pending === 1 ? "" : "s"} to upload`
        : "Offline"
      : sync.pending > 0
        ? `${sync.pending} change${sync.pending === 1 ? "" : "s"} to upload`
        : "Synced";
  const healthy = sync.connected && !sync.needsSignIn;
  return (
    <Group title="Sync">
      <Row label={auth.email} note="Settings marked account follow you to every device">
        <RowButton onClick={() => void window.cal.auth.signOut()}>Sign out</RowButton>
      </Row>
      <Row label="Status">
        <span className="flex items-center gap-2 text-small text-ink-2 tnum">
          <span className={`h-2 w-2 rounded-full ${healthy ? "bg-success" : "bg-warning"}`} />
          {status}
        </span>
      </Row>
    </Group>
  );
}
