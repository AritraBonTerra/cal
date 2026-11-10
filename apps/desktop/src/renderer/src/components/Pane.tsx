import { useSettings } from "@cal/app-core";
import { useEffect, useRef, useState } from "react";
import { clampWidth, dragWidth, PANES, type PaneName } from "../lib/panes";
import { togglePane } from "../lib/ui";

// The sidebar floating over the content while it's hidden: sliding in, sliding out, or
// not shown (null).
export type Peek = "in" | "out" | null;

// How close to the window's left edge the pointer rests (px), and for how long (ms),
// before the sidebar peeks; how long it stays after the pointer leaves; its slide time.
const EDGE = 4;
const REST = 150;
const LINGER = 300;
const SLIDE = 200;

/**
 * The hidden sidebar's peek. Resting the pointer at the window's left edge slides it in
 * over the content (App passes the result to the sidebar's `Pane`); it slides out 300ms
 * after the pointer leaves it, and goes at once on Escape or when `available` turns
 * false (the sidebar is shown or an overlay opens). A pressed button, as in any drag,
 * never starts one.
 */
export function useSidebarPeek(available: boolean, width: number) {
  const [peek, setPeek] = useState<Peek>(null);
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    if (!available) return;
    let state: Peek = null;
    let rest: ReturnType<typeof setTimeout> | undefined;
    let linger: ReturnType<typeof setTimeout> | undefined;
    let slide: ReturnType<typeof setTimeout> | undefined;
    const set = (next: Peek) => {
      state = next;
      setPeek(next);
    };
    const clearAll = () => {
      clearTimeout(rest);
      clearTimeout(linger);
      clearTimeout(slide);
      rest = linger = slide = undefined;
    };
    const leave = () => {
      clearAll();
      set("out");
      slide = setTimeout(() => set(null), SLIDE);
    };
    // Where the pointer is now: at the edge, over the shown panel, or elsewhere.
    const track = (x: number | null, pressed: boolean) => {
      if (state === "in") {
        if (x !== null && x < widthRef.current) {
          clearTimeout(linger);
          linger = undefined;
        } else linger ??= setTimeout(leave, LINGER);
        return;
      }
      if (x === null || x > EDGE || pressed) {
        clearTimeout(rest);
        rest = undefined;
        return;
      }
      rest ??= setTimeout(() => {
        clearAll();
        set("in");
      }, REST);
    };
    const onMove = (event: PointerEvent) => track(event.clientX, event.buttons !== 0);
    // Leaving the window counts as leaving the panel.
    const onOut = (event: PointerEvent) => {
      if (!event.relatedTarget) track(null, false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || state === null) return;
      event.preventDefault();
      clearAll();
      set(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerout", onOut);
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearAll();
      setPeek(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onOut);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [available]);

  return peek;
}

/**
 * A side pane that slides open and closed by width (200ms ease-out; instant under
 * reduced motion) and resizes by dragging its right edge (no slide while dragging). Its
 * content stays mounted, at the pane's width even while the pane slides, so scroll
 * positions survive a toggle and the calendar beside it only ever changes width. The
 * sidebar's pane also hosts its `peek`, floating over the content while it's hidden.
 */
export function Pane({
  name,
  open,
  peek = null,
  children,
}: {
  name: PaneName;
  open: boolean;
  peek?: Peek;
  children: React.ReactNode;
}) {
  const { device, setDevice } = useSettings();
  const { setting, initial } = PANES[name];
  const saved = clampWidth(name, device[setting]);
  // The width while the edge is dragged; "closing" once it's past the close threshold.
  const [live, setLive] = useState<number | "closing" | null>(null);
  // Where the drag started; `cancelled` after Escape, which holds the starting width
  // (with no slide) until the pointer is released.
  const press = useRef<{ x: number; width: number; cancelled: boolean } | null>(null);
  const width = typeof live === "number" ? live : saved;
  const shown = open || peek !== null;

  // Escape mid-drag puts the starting width back at once, and the pane closing from the
  // keyboard mid-drag drops the drag (its handle goes with it).
  const dragging = live !== null;
  useEffect(() => {
    if (open) return;
    press.current = null;
    setLive(null);
  }, [open]);
  useEffect(() => {
    if (!dragging) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !press.current) return;
      event.preventDefault();
      press.current.cancelled = true;
      setLive(press.current.width);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dragging]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    // No focus change or text selection from the drag.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = { x: event.clientX, width: saved, cancelled: false };
    setLive(saved);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!press.current || press.current.cancelled) return;
    setLive(dragWidth(name, press.current.width + event.clientX - press.current.x) ?? "closing");
  };
  // Letting go saves the new width, or closes the pane (keeping its width for next time);
  // after Escape it only ends the drag.
  const onPointerUp = () => {
    const state = press.current;
    press.current = null;
    if (state && !state.cancelled) {
      if (live === "closing") togglePane(name);
      else if (live !== null && live !== saved) setDevice(setting, live);
    }
    setLive(null);
  };
  const onCancel = () => {
    press.current = null;
    setLive(null);
  };

  return (
    <div
      className={`relative shrink-0 ${dragging ? "" : "pane-slide"}`}
      style={{ width: live === "closing" || !open ? 0 : width }}
      aria-hidden={!shown}
      inert={!shown}
      data-pane={name}
      data-open={open ? "" : undefined}
    >
      <div className="h-full overflow-hidden">
        <div
          className={
            peek
              ? `fixed inset-y-0 left-0 z-30 shadow-float ${peek === "in" ? "peek-in" : "peek-out"}`
              : "h-full"
          }
          style={{ width }}
          data-peek={peek ?? undefined}
        >
          {children}
        </div>
      </div>
      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: a pointer-only handle; ⌘K has "Reset Pane Widths".
        <div
          className="no-drag group absolute inset-y-0 -right-1 z-10 flex w-2 cursor-col-resize justify-center"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onCancel}
          onDoubleClick={() => setDevice(setting, initial)}
          data-resize={name}
          data-dragging={dragging ? "" : undefined}
        >
          <div className="w-px group-hover:bg-edge-strong group-data-[dragging]:bg-edge-strong" />
        </div>
      )}
    </div>
  );
}
