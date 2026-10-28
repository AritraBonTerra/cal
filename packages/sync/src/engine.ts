import type { SyncedTable } from "@cal/backend/sync";
import { ConvexError } from "convex/values";
import type { SqlRow } from "./db";
import type { LocalStore, OpKind, PendingOp, ServerRecord } from "./store";

export interface UploadOp {
  op: OpKind;
  table: SyncedTable;
  id: string;
  data?: SqlRow;
}

export interface PullPage {
  changes: ServerRecord[];
  seq: number;
  more: boolean;
}

/**
 * The server, as the engine sees it. `convexRemote` implements it over a ConvexClient,
 * whose mutations wait out connection loss rather than failing, so a rejected upload
 * means the server refused it.
 */
export interface Remote {
  upload(device: string, ops: UploadOp[]): Promise<ServerRecord[]>;
  // Subscribes to `sync:pull` after change number `after`; returns an unsubscribe.
  watch(
    after: number,
    onPage: (page: PullPage) => void,
    onError: (error: Error) => void,
  ): () => void;
}

export interface SyncEngineOptions {
  // Called with every failed upload or pull, for logging.
  onError?: (error: unknown) => void;
  // Upload attempts for a single write before it moves to `_rejected`.
  maxAttempts?: number;
  // Delay before retry number `attempt` (1-based).
  backoff?: (attempt: number) => number;
}

const BATCH = 100;

/**
 * Keeps a LocalStore in step with the server while signed in: uploads the outbox in
 * order, one batch at a time, and applies pulled pages as they arrive.
 *
 * A batch the server refuses is retried one write at a time to find the bad write,
 * which is retried with backoff and finally set aside in `_rejected`. NOT_AUTHENTICATED
 * pauses uploads until `resume()`, since it means the session needs refreshing.
 */
export class SyncEngine {
  private running = false;
  private uploading = false;
  private paused = false;
  private batchSize = BATCH;
  private failures = 0;
  private pullFailures = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private pullRetry: ReturnType<typeof setTimeout> | undefined;
  private unwatch: (() => void) | undefined;
  private unsubscribe: (() => void) | undefined;
  private readonly idleWaiters = new Set<() => void>();

  constructor(
    private readonly store: LocalStore,
    private readonly remote: Remote,
    private readonly options: SyncEngineOptions = {},
  ) {}

  // Starts syncing as `userId` (see `LocalStore.setUser`).
  start(userId: string) {
    this.stop();
    this.store.setUser(userId);
    this.running = true;
    this.paused = false;
    this.unsubscribe = this.store.subscribe(({ local }) => {
      if (local) this.kick();
    });
    this.watch();
    this.kick();
  }

  stop() {
    this.running = false;
    this.unwatch?.();
    this.unsubscribe?.();
    this.unwatch = this.unsubscribe = undefined;
    clearTimeout(this.retry);
    clearTimeout(this.pullRetry);
    this.retry = this.pullRetry = undefined;
    this.settle();
  }

  // Resumes uploads paused by NOT_AUTHENTICATED, after the session is refreshed.
  resume() {
    if (!this.running) return;
    this.paused = false;
    this.watch();
    this.kick();
  }

  // Resolves once the outbox is empty, or the engine stops or pauses.
  idle() {
    return new Promise<void>((resolve) => {
      this.idleWaiters.add(resolve);
      this.settle();
    });
  }

  private watch() {
    this.unwatch?.();
    clearTimeout(this.pullRetry);
    this.pullRetry = undefined;
    const after = this.store.seq;
    this.unwatch = this.remote.watch(
      after,
      (page) => this.onPage(after, page),
      (error) => this.onPullError(error),
    );
  }

  private onPage(after: number, page: PullPage) {
    // A page for an older subscription, already superseded.
    if (!this.running || after !== this.store.seq) return;
    this.pullFailures = 0;
    if (page.seq === after) return;
    this.store.applyServer(page.changes, { seq: page.seq });
    this.watch();
  }

  private onPullError(error: Error) {
    this.options.onError?.(error);
    if (!this.running) return;
    this.unwatch?.();
    this.unwatch = undefined;
    if (isNotAuthenticated(error)) {
      this.pause();
      return;
    }
    this.pullFailures++;
    this.pullRetry = setTimeout(() => this.watch(), this.delay(this.pullFailures));
  }

  private kick() {
    if (!this.running || this.paused || this.uploading || this.retry) return;
    void this.drain();
  }

  private async drain() {
    this.uploading = true;
    try {
      for (;;) {
        if (!this.running || this.paused) return;
        const batch = this.store.pending(this.batchSize);
        if (batch.length === 0) return;
        let records: ServerRecord[];
        try {
          records = await this.remote.upload(this.store.device, batch.map(toUploadOp));
        } catch (error) {
          this.onUploadError(batch, error);
          return;
        }
        // If stopped meanwhile, the store may be closed; the next start re-sends the
        // batch, which the server treats as a no-op.
        if (!this.running) return;
        this.store.applyServer(records, { confirm: batch.map((entry) => entry.id) });
        this.failures = 0;
        this.batchSize = BATCH;
      }
    } finally {
      this.uploading = false;
      this.settle();
    }
  }

  private onUploadError(batch: PendingOp[], error: unknown) {
    this.options.onError?.(error);
    if (isNotAuthenticated(error)) {
      this.pause();
      return;
    }
    const [first] = batch;
    if (batch.length > 1) {
      this.batchSize = 1;
      this.schedule(0);
    } else if (first && ++this.failures >= (this.options.maxAttempts ?? 5)) {
      this.failures = 0;
      this.store.reject(first, error instanceof Error ? error.message : String(error));
      this.watch();
      this.schedule(0);
    } else {
      this.schedule(this.delay(this.failures));
    }
  }

  private schedule(ms: number) {
    this.retry = setTimeout(() => {
      this.retry = undefined;
      this.kick();
    }, ms);
  }

  private pause() {
    this.paused = true;
    this.settle();
  }

  private delay(attempt: number) {
    return this.options.backoff?.(attempt) ?? Math.min(1000 * 2 ** (attempt - 1), 60_000);
  }

  private settle() {
    const done =
      !this.running ||
      this.paused ||
      (!this.uploading && !this.retry && this.store.pendingCount() === 0);
    if (!done) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }
}

const toUploadOp = ({ op, table, uuid, data }: PendingOp): UploadOp =>
  data ? { op, table, id: uuid, data } : { op, table, id: uuid };

function isNotAuthenticated(error: unknown) {
  if (!(error instanceof ConvexError)) return false;
  const data: unknown = error.data;
  return typeof data === "object" && data !== null && "code" in data
    ? data.code === "NOT_AUTHENTICATED"
    : false;
}
