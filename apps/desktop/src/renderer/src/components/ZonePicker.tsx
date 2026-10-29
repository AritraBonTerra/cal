import { useSettings } from "@cal/app-core";
import { Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNow } from "../lib/clock";
import { setFormZone } from "../lib/events";
import { formatMinutes } from "../lib/time";
import { closeOverlay, useUi } from "../lib/ui";
import { useZoneSettings } from "../lib/zoneSettings";
import { offsetLabel, searchZones, zoneAbbreviation, zonedMinutes } from "../lib/zones";
import { Keycaps, Overlay } from "./ui";

/*
 * The time-zone picker: a search over every IANA zone by city, country, abbreviation or
 * "UTC+5:30", with recent and common zones first. What choosing does depends on why it
 * opened: add a gutter column, change one (or the primary), or travel (`Z`).
 */
export function ZonePicker() {
  const purpose = useUi((state) => state.zonePicker);
  const { device } = useSettings();
  const zones = useZoneSettings();
  const now = useNow();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const results = searchZones(query, device.recentZones, now).slice(0, 60);
  const current = results[Math.min(cursor, results.length - 1)];

  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls whenever the cursor or results move.
  useEffect(() => {
    listRef.current?.querySelector("[aria-selected=true]")?.scrollIntoView({ block: "nearest" });
  }, [cursor, query]);

  const heading =
    purpose.kind === "travel"
      ? "Travel to time zone"
      : purpose.kind === "event"
        ? "Event time zone"
        : purpose.kind === "change"
          ? purpose.index === undefined
            ? "Change primary time zone"
            : "Change time zone"
          : "Add time zone";

  const choose = (zone: string | undefined) => {
    if (!zone) return;
    closeOverlay();
    if (purpose.kind === "travel") zones.travel(zone);
    else if (purpose.kind === "event") setFormZone(zone);
    else if (purpose.kind === "add") zones.add(zone);
    else if (purpose.index === undefined) zones.setPrimary(zone);
    else zones.change(purpose.index, zone);
  };

  return (
    <Overlay onClose={closeOverlay} width={520} label={heading}>
      <div className="flex h-11 items-center gap-3 border-b border-grid px-4">
        <Globe size={16} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-ink-3" />
        <input
          // biome-ignore lint/a11y/noAutofocus: the picker exists to be typed into.
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown")
              setCursor((value) => Math.min(results.length - 1, value + 1));
            else if (event.key === "ArrowUp") setCursor((value) => Math.max(0, value - 1));
            else if (event.key === "Enter") choose(current?.zone);
            else if (event.key === "Escape") closeOverlay();
            else return;
            event.preventDefault();
          }}
          placeholder={`${heading}: city, country or UTC±n…`}
          aria-label={heading}
          className="h-11 min-w-0 flex-1 bg-transparent text-title-3 text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      <div ref={listRef} role="listbox" className="max-h-[calc(70vh-76px)] overflow-y-auto p-2">
        {results.length === 0 && (
          <div className="px-3 py-6 text-center text-small text-ink-3">No matching time zones</div>
        )}
        {results.map((entry, index) => {
          const selected = entry === current;
          const recent = !query.trim() && device.recentZones.includes(entry.zone);
          const showGroup =
            !query.trim() &&
            (index === 0 || recent !== device.recentZones.includes(results[index - 1]?.zone ?? ""));
          return (
            <div key={entry.zone}>
              {showGroup && (
                <div className="px-3 pt-2 pb-1 text-caption font-medium text-ink-3">
                  {recent ? "Recent" : "Common"}
                </div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onMouseMove={() => setCursor(index)}
                onClick={() => choose(entry.zone)}
                className={`relative flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-body text-ink ${
                  selected ? "bg-hover" : ""
                }`}
              >
                {selected && (
                  <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-accent" />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {entry.city}
                  <span className="ml-2 text-small text-ink-3">{entry.zone}</span>
                </span>
                <span className="shrink-0 text-small text-ink-2 tnum">
                  {formatMinutes(zonedMinutes(now, entry.zone))}
                </span>
                <span className="w-20 shrink-0 text-right text-caption text-ink-3 tnum">
                  {zoneAbbreviation(entry.zone, now) === offsetLabel(entry.zone, now)
                    ? offsetLabel(entry.zone, now)
                    : `${zoneAbbreviation(entry.zone, now)} · ${offsetLabel(entry.zone, now)}`}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <footer className="flex h-8 items-center gap-4 border-t border-grid px-4 text-caption text-ink-3">
        <span className="flex items-center gap-1">
          <Keycaps binding="enter" /> {purpose.kind === "travel" ? "Travel" : "Choose"}
        </span>
        <span className="flex items-center gap-1">
          <Keycaps binding="arrowup" />
          <Keycaps binding="arrowdown" /> Move
        </span>
        <span className="flex items-center gap-1">
          <Keycaps binding="escape" /> Close
        </span>
        {purpose.kind === "travel" && (
          <span className="ml-auto">The grid shows that zone until you press Esc</span>
        )}
      </footer>
    </Overlay>
  );
}
