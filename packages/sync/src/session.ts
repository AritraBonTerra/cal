import { api } from "@cal/backend/api";
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { convexRemote } from "./convexRemote";
import { SyncEngine } from "./engine";
import type { LocalStore } from "./store";

export type AuthState =
  | { status: "signedOut" }
  | { status: "signedIn"; userId: string; email: string };

export type SignInFlow = "signIn" | "signUp";

export interface SyncStatus {
  // Local edits not yet confirmed by the server.
  pending: number;
  connected: boolean;
  // Signed in, but the session needs signing in again.
  needsSignIn: boolean;
}

/**
 * Where a platform keeps the session's tokens: Electron's safeStorage-encrypted file on
 * the Mac, the Keychain (expo-secure-store) on iOS.
 */
export interface SessionStorage {
  read(): string | undefined;
  write(value: string): void;
  clear(): void;
}

interface Saved {
  token: string;
  refreshToken: string;
  userId: string;
  email: string;
}

type Tokens = { token: string; refreshToken: string };

// Seconds-since-epoch expiry and `sub` from a JWT, without verifying it (the server does).
function claims(token: string) {
  const payload = (token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
  const json: unknown = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
  const record = typeof json === "object" && json !== null ? json : {};
  const exp = "exp" in record && typeof record.exp === "number" ? record.exp : 0;
  const sub = "sub" in record && typeof record.sub === "string" ? record.sub : "";
  // Convex Auth subjects are `userId|sessionId`.
  return { exp, userId: sub.split("|")[0] ?? "" };
}

/**
 * The signed-in session: Convex Auth tokens (kept in the platform's SessionStorage), the
 * Convex connection, and the sync engine. The app works fully offline; once signed in,
 * the session survives restarts and retries refreshing its token until the network is
 * back. Email and password sign-in only, so no OAuth redirects.
 */
export class Session {
  private readonly http: ConvexHttpClient;
  private readonly client: ConvexClient;
  private readonly engine: SyncEngine;
  private saved: Saved | undefined;
  private needsSignIn = false;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private retries = 0;
  // Bumped on sign-in and sign-out, so a token refresh still in flight from an earlier
  // session can't bring it back or overwrite the new one.
  private generation = 0;

  constructor(
    private readonly url: string,
    private readonly store: LocalStore,
    private readonly storage: SessionStorage,
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

  // Restores a saved session, if any, and starts syncing.
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

  async signIn(email: string, password: string, flow: SignInFlow) {
    const result = await this.http.action(api.auth.signIn, {
      provider: "password",
      params: { email, password, flow },
    });
    if (!result.tokens) throw new Error("Sign-in didn't return a session.");
    this.generation++;
    this.saved = { ...result.tokens, userId: claims(result.tokens.token).userId, email };
    this.needsSignIn = false;
    this.save();
    this.connect();
    this.notify.auth(this.state());
    return this.state();
  }

  // Signs out here at once, even offline; ending the session on the server is best effort.
  async signOut() {
    const token = this.saved?.token;
    this.generation++;
    this.engine.stop();
    clearTimeout(this.retry);
    this.client.client.clearAuth();
    this.saved = undefined;
    this.needsSignIn = false;
    this.storage.clear();
    if (token) {
      const http = new ConvexHttpClient(this.url);
      http.setAuth(token);
      // Offline or already expired: the session just lapses on the server.
      http.action(api.auth.signOut, {}).catch(() => undefined);
    }
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
      // Most likely offline while the token expired: try again with backoff.
      clearTimeout(this.retry);
      const delay = Math.min(5_000 * 2 ** this.retries++, 120_000);
      this.retry = setTimeout(() => this.connect(), delay);
    }
    this.notify.sync(this.status());
  }

  // The current JWT, refreshed when it's about to expire or the server rejected it.
  private async token(force: boolean) {
    const saved = this.saved;
    const generation = this.generation;
    if (!saved) return null;
    const fresh = claims(saved.token).exp * 1000 > Date.now() + 60_000;
    if (fresh && !force) return saved.token;
    let tokens: Tokens | null | undefined;
    try {
      ({ tokens } = await this.http.action(api.auth.signIn, {
        refreshToken: saved.refreshToken,
      }));
    } catch {
      return null;
    }
    if (generation !== this.generation) return null;
    if (!tokens) {
      // The refresh token was revoked or expired: only signing in again helps.
      this.needsSignIn = true;
      this.notify.sync(this.status());
      return null;
    }
    this.saved = { ...saved, ...tokens };
    this.save();
    return tokens.token;
  }

  private load(): Saved | undefined {
    try {
      const json: unknown = JSON.parse(this.storage.read() ?? "null");
      if (typeof json !== "object" || json === null) return undefined;
      const field = (key: string) =>
        key in json && typeof Reflect.get(json, key) === "string"
          ? String(Reflect.get(json, key))
          : "";
      const saved = {
        token: field("token"),
        refreshToken: field("refreshToken"),
        userId: field("userId"),
        email: field("email"),
      };
      return saved.refreshToken && saved.userId ? saved : undefined;
    } catch {
      return undefined;
    }
  }

  private save() {
    if (this.saved) this.storage.write(JSON.stringify(this.saved));
  }
}
