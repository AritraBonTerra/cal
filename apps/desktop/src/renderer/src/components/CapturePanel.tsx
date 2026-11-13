import { useSettings, useTable } from "@cal/app-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCalendars } from "../lib/calendars";
import { setTimeFormat } from "../lib/time";
import { deviceZone } from "../lib/zones";
import { QuickEntryForm } from "./QuickEntry";

/*
 * The whole page of the capture panel: Quick Entry on its own, shown over any app by
 * the global hotkey (main/capture.ts). Enter saves and hides it, Escape or a click
 * elsewhere hides it, and each time it hides it starts over empty. A save that fails
 * keeps the panel open with the reason underneath.
 *
 * A save can outlive its form: the panel may hide (a click elsewhere) and come back with
 * a new entry before the calendar answers. So a save only hides the panel or shows its
 * error while its own round is still on screen, and a round saves at most once.
 */

// The panel shows no events to refresh; main tells the other windows after a write.
const noRefresh = async () => undefined;

export function CapturePanel() {
  const { account, device } = useSettings();
  // Before the chips format a time.
  setTimeFormat(account.timeFormat);
  const projects = useTable("projects").rows;
  const calendars = useCalendars();
  // Bumped when the panel hides, to start the next entry from a fresh form.
  const [round, setRound] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // The round on screen, and whether it has a save under way, updated synchronously so
  // a second Enter or a late answer sees the change before React re-renders.
  const current = useRef({ round: 0, saving: false });

  useEffect(
    () =>
      window.cal.capture.onReset(() => {
        current.current = { round: current.current.round + 1, saving: false };
        setRound(current.current.round);
        setError(null);
      }),
    [],
  );
  useEffect(() => window.cal.setScale(device.uiScale), [device.uiScale]);

  // Tells main the panel's size in window points (CSS pixels times the zoom), so the
  // window grows when the chips wrap and follows the interface size.
  const measure = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      const zoom = device.uiScale / 100;
      const observer = new ResizeObserver(() => {
        const { width, height } = element.getBoundingClientRect();
        void window.cal.capture.setSize(Math.ceil(width * zoom), Math.ceil(height * zoom));
      });
      observer.observe(element);
      return () => observer.disconnect();
    },
    [device.uiScale],
  );

  return (
    <QuickEntryForm
      key={round}
      env={{
        projects,
        calendars,
        account,
        device,
        // Not the main window's travel zone: "9am" is in the primary zone.
        zone: account.primaryZone ?? deviceZone,
        refreshEvents: noRefresh,
      }}
      frame={({ children, onKeyDown }) => (
        <div
          ref={measure}
          role="dialog"
          aria-label="Quick Entry"
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="w-[640px] bg-raised text-ink outline-none"
        >
          {children}
          {error && (
            <p role="alert" className="border-t border-grid px-4 py-2 text-small text-now">
              {error}
            </p>
          )}
        </div>
      )}
      onClose={() => void window.cal.capture.hide()}
      onSubmit={(save) => {
        if (current.current.saving) return;
        const mine = current.current;
        mine.saving = true;
        setError(null);
        save().then(
          () => {
            if (current.current === mine) void window.cal.capture.hide();
          },
          (reason: unknown) => {
            if (current.current !== mine) return;
            mine.saving = false;
            setError(reason instanceof Error ? reason.message : String(reason));
          },
        );
      }}
    />
  );
}
