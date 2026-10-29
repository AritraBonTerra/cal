import { api } from "@cal/backend/api";
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { convexRemote } from "./convexRemote";
import { SyncEngine } from "./engine";
import type { LocalStore } from "./store";

export type AuthState =
  | { status: "signedOut" }
  | { status: "signedIn"; userId: string; email: string };

export interface SyncStatus {
  // Local edits not yet confirmed by the server.
  pending: number;
  connected: boolean;
  // Signed in, but the session needs signing in again.
  needsSignIn: boolean;
}

/**
 * Where a platform keeps who is signed in (`{ userId, email }`, no secrets): a file on
 * the Mac, the Keychain on iOS. The auth session itself lives with the auth client.
 */
export interface SessionStorage {
  read(): string | undefined;
  write(value: string): void;
  clear(): void;
}

/**
 * The platform's sign-in client (Better Auth: Electron on the Mac, Expo on iOS). Signing
 * in is platform UI; once it finishes, the platform calls `Session.signedIn()`.
 */
export interface AuthAdapter {
  // A fresh Convex JWT; "signedOut" when the session is gone, null when unreachable.
  token(): Promise<string | null | "signedOut">;
  // Ends the session here at once, and on the server when reachable.
  signOut(): Promise<void>;
}

interface Saved {
  userId: string;
  email: string;
}

// Seconds-since-epoch expiry of a JWT, without verifying it (the server does).
function expiry(token: string) {
  const payload = (token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
  try {
    const json: unknown = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    return typeof json === "object" &&
      json !== null &&
      "exp" in json &&
      typeof json.exp === "number"
      ? json.exp
      : 0;
  } catch {
    return 0;
  }
}

/**
 * The signed-in session: who is signed in (kept in the platform's SessionStorage), the
 * Convex connection, and the sync engine. The app works fully offline: the session is
 * restored from storage without the network, and Convex tokens are minted from the auth
 * client as needed, retrying with backoff while offline.
 */
export class Session {
  private readonly http: ConvexHttpClient;
  private readonly client: ConvexClient;
  private readonly engine: SyncEngine;
  private saved: Saved | undefined;
  private jwt: string | undefined;
  private needsSignIn = false;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private retries = 0;
  // Bumped on sign-in and sign-out, so a token fetch still in flight from an earlier
  // session can't bring it back.
  private generation = 0;

  constructor(
    url: string,
    private readonly store: LocalStore,
    private readonly storage: SessionStorage,
    private readonly auth: AuthAdapter,
    private readonly notify: { auth(state: AuthState): void; sync(status: SyncStatus): void },
  ) {
    this.http = new ConvexHttpClient(url);
    this.client = new ConvexClient(url);
    this.engine = new SyncEngine(store, convexRemote(this.client), {
      onError: (error) => console.warn("[sync]", error),
    });
    this.client.subscribeToConnectionState(() => this.notify.sync(this.status()));
    store.subscribe(() => this.notify.sync(this.status()));
  }

  // Restores who was signed in, if anyone, and starts syncing.
  init() {
    this.saved = this.load();
    if (this.saved) this.connect();
  }

  state(): AuthState {
    return this.saved
      ? { status: "signedIn", userId: this.saved.userId, email: this.saved.email }
      : { status: "signedOut" };
  }

  status(): SyncStatus {
    return {
      pending: this.store.pendingCount(),
      connected: this.client.connectionState().isWebSocketConnected,
      needsSignIn: this.needsSignIn,
    };
  }

  /**
   * Finishes signing in after the platform's flow created an auth session: asks Convex
   * which Cal user that is (the JWT names the auth user, not Cal's id), then syncs.
   */
  async signedIn() {
    const generation = ++this.generation;
    this.jwt = undefined;
    const token = await this.auth.token();
    if (token === null) throw new Error("Couldn't reach the server to finish signing in.");
    if (token === "signedOut") throw new Error("Sign-in didn't complete. Try again.");
    this.http.setAuth(token);
    const me = await this.http.query(api.users.me, {});
    if (generation !== this.generation) return this.state();
    this.jwt = token;
    this.saved = { userId: me.userId, email: me.email };
    this.needsSignIn = false;
    this.storage.write(JSON.stringify(this.saved));
    this.connect();
    this.notify.auth(this.state());
    return this.state();
  }

  // Signs out here at once, even offline; ending the session on the server is best effort.
  async signOut() {
    this.generation++;
    this.engine.stop();
    clearTimeout(this.retry);
    this.client.client.clearAuth();
    this.saved = undefined;
    this.jwt = undefined;
    this.needsSignIn = false;
    this.storage.clear();
    this.auth.signOut().catch(() => undefined);
    this.notify.auth(this.state());
    this.notify.sync(this.status());
    return this.state();
  }

  async close() {
    this.engine.stop();
    clearTimeout(this.retry);
    await this.client.close();
  }

  private connect() {
    const saved = this.saved;
    if (!saved) return;
    this.client.setAuth(
      ({ forceRefreshToken }) => this.token(forceRefreshToken),
      (authenticated) => this.onAuth(authenticated),
    );
    this.engine.start(saved.userId);
  }

  private onAuth(authenticated: boolean) {
    if (authenticated) {
      this.retries = 0;
      this.engine.resume();
    } else if (this.saved && !this.needsSignIn) {
      // Most likely offline: try again with backoff.
      clearTimeout(this.retry);
      const delay = Math.min(5_000 * 2 ** this.retries++, 120_000);
      this.retry = setTimeout(() => this.connect(), delay);
    }
    this.notify.sync(this.status());
  }

  // The current Convex JWT, minted again when it's about to expire or was rejected.
  private async token(force: boolean) {
    const generation = this.generation;
    if (!this.saved) return null;
    if (this.jwt && !force && expiry(this.jwt) * 1000 > Date.now() + 60_000) return this.jwt;
    const token = await this.auth.token().catch(() => null);
    if (generation !== this.generation) return null;
    if (token === "signedOut") {
      // The auth session expired or was revoked: only signing in again helps.
      this.needsSignIn = true;
      this.notify.sync(this.status());
      return null;
    }
    this.jwt = token ?? undefined;
    return token;
  }

  // Who was signed in; also reads the older shape that carried Convex Auth tokens.
  private load(): Saved | undefined {
    try {
      const json: unknown = JSON.parse(this.storage.read() ?? "null");
      if (typeof json !== "object" || json === null) return undefined;
      const field = (key: string) =>
        key in json && typeof Reflect.get(json, key) === "string"
          ? String(Reflect.get(json, key))
          : "";
      const saved = { userId: field("userId"), email: field("email") };
      return saved.userId ? saved : undefined;
    } catch {
      return undefined;
    }
  }
}
