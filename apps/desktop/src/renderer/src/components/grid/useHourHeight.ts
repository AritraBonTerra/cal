import { useSettings } from "@cal/app-core";
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DEFAULT_HOUR, MAX_HOUR, zoomStep } from "./model";

/*
 * The grid's hour height. The stored setting is a floor: the effective height is the
 * larger of it and the height that fits all 24 hours in the body (so a tall window
 * never leaves blank space under 11 PM, and 0 means "always fit"). Zooming keeps one
 * time pinned: the time under the pointer for pinch and ⌥-scroll, the viewport's center
 * for the keys, and the top edge when the window resizes.
 */

// How long after the last wheel tick the zoom is written to the device setting.
const PERSIST_AFTER = 200;

export function useHourHeight(bodyRef: RefObject<HTMLDivElement | null>) {
  const { device, setDevice } = useSettings();
  const [viewport, setViewport] = useState(0);
  // The height while a wheel gesture is in flight, before it's persisted.
  const [live, setLive] = useState<number | null>(null);
  const fit = viewport / 24;
  const stored = live ?? device.hourHeight;
  const hour = Math.max(stored, fit) || DEFAULT_HOUR;

  // Where to keep the time fixed (offset from the body's top) on the next height change.
  const anchor = useRef(0);
  const previous = useRef(hour);
  const latest = useRef({ hour, fit, stored });
  latest.current = { hour, fit, stored };

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    setViewport(body.clientHeight);
    const observer = new ResizeObserver(() => setViewport(body.clientHeight));
    observer.observe(body);
    return () => observer.disconnect();
  }, [bodyRef]);

  // After the DOM takes a new height, move the scroll so the anchored time stays put.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const before = previous.current;
    previous.current = hour;
    if (!body || before === hour) return;
    const minute = ((body.scrollTop + anchor.current) / before) * 60;
    body.scrollTop = (minute / 60) * hour - anchor.current;
    anchor.current = 0;
  }, [hour, bodyRef]);

  // A wheel gesture's unsaved height and the timer that will save it.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveValue = useRef<number | null>(null);

  // Stores a height, dropping any wheel save still pending so it can't overwrite this one.
  const store = useCallback(
    (value: number) => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = null;
      liveValue.current = null;
      setLive(null);
      if (value !== device.hourHeight) setDevice("hourHeight", value);
    },
    [device.hourHeight, setDevice],
  );
  // Persists a zoomed height: at (or under) fit it's saved as 0, "fit", so it tracks resizes.
  const persist = useCallback(
    (next: number) => store(next <= latest.current.fit + 0.5 ? 0 : Math.round(next * 10) / 10),
    [store],
  );

  // Key zoom: one ladder step, pinned to the viewport's center.
  const step = useCallback(
    (direction: 1 | -1) => {
      const body = bodyRef.current;
      const { hour: current, fit: floor } = latest.current;
      anchor.current = body ? body.clientHeight / 2 : 0;
      persist(zoomStep(current, floor, direction));
    },
    [bodyRef, persist],
  );

  // The default itself, never "fit": in a window tall enough that fit is above the
  // default, the default must come back once the window shrinks.
  const reset = useCallback(() => {
    anchor.current = bodyRef.current ? bodyRef.current.clientHeight / 2 : 0;
    store(DEFAULT_HOUR);
  }, [bodyRef, store]);

  // Pinch (ctrl+wheel) and ⌥-scroll zoom continuously around the pointer.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.altKey) return;
      event.preventDefault();
      const { hour: current, fit: floor } = latest.current;
      const delta = Math.max(-25, Math.min(25, event.deltaY));
      const next = Math.min(MAX_HOUR, Math.max(floor, current * Math.exp(-delta * 0.01)));
      anchor.current = event.clientY - body.getBoundingClientRect().top;
      liveValue.current = next;
      setLive(next);
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        pending.current = null;
        if (liveValue.current !== null) persist(liveValue.current);
      }, PERSIST_AFTER);
    };
    body.addEventListener("wheel", onWheel, { passive: false });
    return () => body.removeEventListener("wheel", onWheel);
  }, [bodyRef, persist]);

  return { hour, fit, step, reset };
}
