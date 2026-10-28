import { type ChildProcess, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  CalendarAccess,
  CalendarSource,
  DeviceCalendar,
  EventInput,
  EventSpan,
  ExternalEvent,
} from "@cal/calendar-source";

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

/**
 * The Mac's calendars through the `calkit` Swift helper (native/calkit), which speaks
 * JSON lines over stdio. The helper starts on first use and restarts if it exits.
 */
export class Calkit implements CalendarSource {
  private child: ChildProcess | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly binary: string) {}

  access() {
    return this.call<CalendarAccess>("access");
  }

  requestAccess() {
    return this.call<CalendarAccess>("requestAccess");
  }

  calendars() {
    return this.call<DeviceCalendar[]>("calendars");
  }

  events(start: string, end: string, calendarIds?: readonly string[]) {
    return this.call<ExternalEvent[]>("events", { start, end, calendarIds });
  }

  createEvent(input: EventInput) {
    return this.call<ExternalEvent>("createEvent", { ...input });
  }

  updateEvent(id: string, input: Partial<EventInput>, span: EventSpan) {
    return this.call<ExternalEvent>("updateEvent", { id, input, span });
  }

  async deleteEvent(id: string, span: EventSpan) {
    await this.call("deleteEvent", { id, span });
  }

  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  stop() {
    this.child?.kill();
    this.child = undefined;
  }

  // The helper's reply to `method`, typed by the caller to match calkit's JSON.
  private call<T>(method: string, params: Record<string, unknown> = {}) {
    const child = this.start();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
      child.stdin?.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  private start() {
    if (this.child) return this.child;
    const child = spawn(this.binary, [], { stdio: ["pipe", "pipe", "inherit"] });
    this.child = child;
    createInterface({ input: child.stdout }).on("line", (line) => this.receive(line));
    child.on("exit", () => {
      if (this.child === child) this.child = undefined;
      for (const { reject } of this.pending.values()) reject(new Error("calkit exited"));
      this.pending.clear();
    });
    child.on("error", (error) => {
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
    });
    return child;
  }

  private receive(line: string) {
    let message: { id?: number; result?: unknown; error?: string; event?: string };
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.event === "changed") {
      for (const listener of this.listeners) listener();
      return;
    }
    const pending = message.id === undefined ? undefined : this.pending.get(message.id);
    if (!pending || message.id === undefined) return;
    this.pending.delete(message.id);
    if (message.error !== undefined) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
  }
}
