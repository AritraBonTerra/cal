import { Plus } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { useApp } from "../../lib/app";
import { useNow } from "../../lib/clock";
import { DRAG_THRESHOLD } from "../../lib/drag";
import { formatWeekday } from "../../lib/time";
import { openZonePicker, ui, useUi } from "../../lib/ui";
import { useZoneSettings } from "../../lib/zoneSettings";
import { deviceZone, dstShift, zoneAbbreviation, zoneCity } from "../../lib/zones";
import { ContextMenu, type MenuItem } from "../ui";
import { GUTTER, ZONE_COLUMN } from "./model";

/*
 * The gutter's header cells, in the day-header row: one per extra time zone (outermost
 * first) and the main zone beside the grid with its `+`. Right-click a cell for its
 * menu, double-click to rename, drag to reorder; the right-most column is the primary.
 * A column whose offset from the main zone changes within the visible days shows the
 * change ("+1h Sun"), so a label is never silently wrong across a DST switch.
 */

// "PDT", "+5:30": the abbreviation, with "GMT" dropped from offset-style names to fit.
export function shortZoneLabel(zone: string, at: Date) {
  const name = zoneAbbreviation(zone, at);
  return /^GMT[+-]/.test(name) ? name.slice(3) : name;
}

interface Menu {
  x: number;
  y: number;
  // Index among the extras, or "primary".
  target: number | "primary";
}

export function ZoneHeaders() {
  const { days, zone, gridToday } = useApp();
  const now = useNow();
  const zones = useZoneSettings();
  const travelZone = useUi((state) => state.travelZone);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [drag, setDrag] = useState<{
    index: number;
    startX: number;
    x: number;
    moved: boolean;
  } | null>(null);
  const reference = days.includes(gridToday) ? gridToday : (days[0] ?? gridToday);
  const row = useRef<HTMLDivElement>(null);

  const onContextMenu = (event: React.MouseEvent, target: Menu["target"]) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, target });
  };

  // Drag an extra column: track the pointer; on release, drop it at the slot under it.
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>, index: number) => {
    if (event.button !== 0 || renaming !== null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ index, startX: event.clientX, x: event.clientX, moved: false });
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return;
    const moved = drag.moved || Math.abs(event.clientX - drag.startX) >= DRAG_THRESHOLD;
    setDrag({ ...drag, x: event.clientX, moved });
  };
  const slotAt = (clientX: number) => {
    const left = row.current?.getBoundingClientRect().left ?? 0;
    return Math.max(0, Math.min(zones.extras.length, Math.floor((clientX - left) / ZONE_COLUMN)));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return;
    const { index, moved } = drag;
    setDrag(null);
    if (!moved) return;
    const slot = slotAt(event.clientX);
    const column = zones.extras[index];
    if (!column) return;
    if (slot >= zones.extras.length) zones.makePrimary(column.zone);
    else if (slot !== index) zones.reorder(index, slot);
  };

  const items = (target: Menu["target"]): MenuItem[] => {
    if (target === "primary") {
      const traveling = travelZone !== null;
      return [
        {
          label: "Add time zone…",
          run: () => openZonePicker({ kind: "add" }),
          disabled: zones.full,
        },
        { label: "Change primary zone…", run: () => openZonePicker({ kind: "change" }) },
        ...(traveling
          ? [
              { label: "Keep as primary", run: () => zones.makePrimary(zone), divider: true },
              { label: "Add as extra column", run: () => travelZone && zones.add(travelZone) },
              { label: "Stop travelling", run: () => ui.set({ travelZone: null }) },
            ]
          : []),
        ...(zones.primary !== deviceZone && !traveling
          ? [
              {
                label: `Follow Mac (${zoneCity(deviceZone)})`,
                run: () => zones.setPrimary(null),
                divider: true,
              },
            ]
          : []),
      ];
    }
    const column = zones.extras[target];
    return [
      { label: "Change…", run: () => openZonePicker({ kind: "change", index: target }) },
      { label: "Rename…", run: () => setRenaming(target) },
      { label: "Make primary", run: () => column && zones.makePrimary(column.zone) },
      { label: "Remove", run: () => zones.remove(target), danger: true, divider: true },
    ];
  };

  return (
    <div
      ref={row}
      className="flex h-11 shrink-0 items-stretch"
      style={{ width: GUTTER + ZONE_COLUMN * zones.extras.length }}
    >
      {zones.extras.map((column, index) => {
        const shift = dstShift(column.zone, zone, reference, days);
        const dragging = drag?.index === index && drag.moved;
        const dropSlot = drag?.moved ? slotAt(drag.x) : null;
        return (
          <ZoneCell
            key={column.zone}
            zone={column.zone}
            label={column.label ?? shortZoneLabel(column.zone, now)}
            title={`${zoneCity(column.zone)} · ${zoneAbbreviation(column.zone, now)}`}
            shift={shift ? `${shift.hours > 0 ? "+" : "−"}${Math.abs(shift.hours)}h` : null}
            shiftTitle={
              shift
                ? `From ${formatWeekday(shift.day, true)}, ${zoneCity(column.zone)} is ${Math.abs(
                    shift.hours,
                  )}h ${shift.hours > 0 ? "further ahead" : "further behind"} (daylight saving)`
                : undefined
            }
            dragging={dragging}
            renaming={renaming === index}
            onRename={(label) => {
              setRenaming(null);
              zones.rename(index, label);
            }}
            onContextMenu={(event) => onContextMenu(event, index)}
            onDoubleClick={() => setRenaming(index)}
            onPointerDown={(event) => onPointerDown(event, index)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            dropTarget={dropSlot === index && drag?.index !== index}
          />
        );
      })}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the right-click menu for the main zone. */}
      <div
        className={`flex min-w-0 flex-1 items-center justify-end gap-0.5 pr-1.5 ${
          drag?.moved && slotAt(drag.x) >= zones.extras.length ? "bg-accent-soft" : ""
        }`}
        onContextMenu={(event) => onContextMenu(event, "primary")}
        data-zone-primary
      >
        {!zones.full && (
          <button
            type="button"
            aria-label="Add time zone"
            title="Add time zone"
            onClick={() => openZonePicker({ kind: "add" })}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink-2"
          >
            <Plus size={11} strokeWidth={1.5} absoluteStrokeWidth />
          </button>
        )}
        <span
          className={`truncate text-caption font-medium tnum ${travelZone ? "text-now" : "text-ink-3"}`}
          title={`${zoneCity(zone)} · ${zoneAbbreviation(zone, now)}${travelZone ? " · travelling, Esc to return" : ""}`}
        >
          {shortZoneLabel(zone, now)}
        </span>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={items(menu.target)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

interface ZoneCellProps {
  zone: string;
  label: string;
  title: string;
  shift: string | null;
  shiftTitle?: string;
  dragging: boolean;
  dropTarget: boolean;
  renaming: boolean;
  onRename: (label: string) => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
}

function ZoneCell({
  zone,
  label,
  title,
  shift,
  shiftTitle,
  dragging,
  dropTarget,
  renaming,
  onRename,
  ...handlers
}: ZoneCellProps) {
  const [text, setText] = useState(label);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) {
      setText(label);
      input.current?.select();
    }
  }, [renaming, label]);
  return (
    <div
      {...handlers}
      title={title}
      data-zone={zone}
      className={`flex w-11 shrink-0 cursor-grab flex-col items-center justify-center text-caption text-ink-3 tnum select-none ${
        dragging ? "opacity-40" : ""
      } ${dropTarget ? "bg-accent-soft" : ""}`}
    >
      {renaming ? (
        <input
          ref={input}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => onRename(text.trim())}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") onRename(text.trim());
            if (event.key === "Escape") onRename(label);
          }}
          aria-label="Zone label"
          className="h-5 w-10 rounded-sm bg-canvas px-1 text-center text-caption text-ink shadow-[inset_0_0_0_1px_var(--cal-accent)] outline-none"
        />
      ) : (
        <span className="max-w-full truncate font-medium">{label}</span>
      )}
      {shift && (
        <span className="font-medium text-ink-2" title={shiftTitle}>
          {shift}
        </span>
      )}
    </div>
  );
}
