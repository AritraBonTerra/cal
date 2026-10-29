import { useActions, useCal } from "@cal/app-core";
import { type DayKey, daysBetween, toOffsetIso, weekday } from "@cal/domain";
import { mix, colors as tokens } from "@cal/theme";
import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useApp } from "../../lib/app";
import { graphite } from "../../lib/calendars";
import { useNow } from "../../lib/clock";
import { DRAG_THRESHOLD, drag, geometry, overTaskPane, useDrag } from "../../lib/drag";
import { layoutColumn } from "../../lib/layout";
import { formatHour, formatMinuteRange, formatMinutes, formatZoneHour } from "../../lib/time";
import { select, ui, useUi } from "../../lib/ui";
import { zonedMinutes } from "../../lib/zones";
import { BlockChip, EventChip, frameStyle } from "./chips";
import {
  DAY_MINUTES,
  dayOf,
  dragged,
  dragSpan,
  GUTTER,
  type Item,
  instant,
  minutesOf,
  pixelsFor,
  type Segment,
  SNAP,
  type Span,
  segments,
  snap,
  ZONE_COLUMN,
} from "./model";

/*
 * The hour grid: a scrolling body with the hour gutter (extra zones first, then the
 * main one) and one column per day. All pointer work happens here with plain pointer
 * events: drag on empty space to create a block, drag a chip to move it, drag its edge
 * to resize, and drop a block on the to-do pane to remove it. Fifteen-minute snapping,
 * off with ⇧. Escape or a cancelled pointer drops the gesture without writing anything.
 * Every y position is minutes × the hour height the view measured; wall-clock minutes
 * are in the grid's zone.
 */

type Gesture =
  | { kind: "create"; anchor: Date; start: Date; end: Date; moved: boolean }
  | {
      kind: "move" | "resize";
      item: Item;
      edge: "start" | "end";
      originDay: DayKey;
      originMinute: number;
      start: Date;
      end: Date;
      moved: boolean;
    };

// The block being typed into after a create gesture; may run past midnight.
type Draft = Span;

// The half-hour outline under a resting pointer, in minutes of one day.
interface Hover {
  day: DayKey;
  start: number;
  end: number;
}

const SCROLL_TO_HOUR = 7.5;

interface TimeGridProps {
  days: readonly DayKey[];
  items: readonly Item[];
  bodyRef: RefObject<HTMLDivElement | null>;
  // Effective pixels per hour, and the height that fits the day in the body.
  hour: number;
  fit: number;
}

export function TimeGrid({ days, items, bodyRef, hour, fit }: TimeGridProps) {
  const {
    gridToday: today,
    mode,
    palette,
    calendars,
    refreshEvents,
    zone,
    account,
    device,
  } = useApp();
  const now = useNow();
  const actions = useActions();
  const { history } = useCal();
  const selection = useUi((state) => state.selection);
  const flashDay = useUi((state) => state.flashDay);
  const ghost = useDrag((state) => state.ghost);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const live = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const extras = account.timeZones;
  const gutter = GUTTER + ZONE_COLUMN * extras.length;
  const dayHeight = 24 * hour;
  const px = (minutes: number) => pixelsFor(minutes, hour);
  const clickLength = account.eventMinutes;

  const setLive = (next: Gesture | null) => {
    live.current = next;
    setGesture(next);
  };

  // Maps a window point to a day and minute, for this grid and for task drags from the list.
  const locate = (clientX: number, clientY: number) => {
    const body = bodyRef.current;
    if (!body) return null;
    const rect = body.getBoundingClientRect();
    const width = (body.clientWidth - gutter) / days.length;
    const x = clientX - rect.left - gutter;
    const index = Math.min(days.length - 1, Math.max(0, Math.floor(x / width)));
    const day = days[index];
    if (!day) return null;
    const y = clientY - rect.top + body.scrollTop;
    return { day, minute: Math.min(DAY_MINUTES, Math.max(0, (y / hour) * 60)) };
  };
  const inside = (clientX: number, clientY: number) => {
    const rect = bodyRef.current?.getBoundingClientRect();
    return (
      rect !== undefined &&
      clientX >= rect.left + gutter &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  };

  const isWritable = (item: Item) =>
    item.kind === "block" ||
    (calendars.find((c) => c.id === item.event.calendarId)?.writable ?? false);

  useLayoutEffect(() => {
    geometry.grid = { locate: (x, y) => (inside(x, y) ? locate(x, y) : null) };
    return () => {
      geometry.grid = null;
    };
  });

  // Opens on the working morning. Later height changes keep their own anchor.
  const scrolled = useRef(false);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (body && !scrolled.current) {
      scrolled.current = true;
      body.scrollTop = SCROLL_TO_HOUR * hour;
    }
  }, [bodyRef, hour]);

  // Pointer gestures. Capture goes to the body so moves keep arriving outside the chip.
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || draft) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, button")) return;
    const point = locate(event.clientX, event.clientY);
    if (!point) return;
    const chip = target?.closest<HTMLElement>("[data-item]");
    const column = target?.closest<HTMLElement>("[data-column]");
    if (chip) {
      const item = items.find((each) => each.id === chip.dataset.item);
      if (!item) return;
      const edge = target?.closest<HTMLElement>("[data-edge]")?.dataset.edge;
      if (!isWritable(item)) {
        selectItem(item);
        return;
      }
      setLive({
        kind: edge ? "resize" : "move",
        item,
        edge: edge === "start" ? "start" : "end",
        originDay: point.day,
        originMinute: point.minute,
        start: item.start,
        end: item.end,
        moved: false,
      });
    } else if (column) {
      const anchor = instant(point.day, snap(point.minute - SNAP / 2), zone);
      setLive({ kind: "create", anchor, ...dragSpan(anchor, anchor), moved: false });
      select(null);
    } else return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setHover(null);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = live.current;
    const point = locate(event.clientX, event.clientY);
    if (!current) {
      const target = event.target instanceof Element ? event.target : null;
      if (
        point &&
        !drag.get().task &&
        target?.closest("[data-column]") &&
        !target.closest("[data-item]")
      ) {
        const start = snap(point.minute - SNAP / 2);
        if (hover?.day !== point.day || hover.start !== start) {
          setHover({ day: point.day, start, end: Math.min(DAY_MINUTES, start + clickLength) });
        }
      } else if (hover) setHover(null);
      return;
    }
    if (!point) return;
    const step = event.shiftKey ? 1 : SNAP;
    if (current.kind === "create") {
      const pointer = instant(point.day, snap(point.minute, step), zone);
      const moved =
        current.moved || Math.abs(pointer.getTime() - current.anchor.getTime()) >= SNAP * 60_000;
      setLive({ ...current, ...dragSpan(current.anchor, pointer), moved });
      return;
    }
    const deltaMinutes = point.minute - current.originMinute;
    const deltaDays = daysBetween(current.originDay, point.day);
    const moved = current.moved || Math.abs(px(deltaMinutes)) >= DRAG_THRESHOLD || deltaDays !== 0;
    if (!moved) return;
    const { item } = current;
    const kind = current.kind === "move" ? "move" : current.edge;
    setLive({ ...current, ...dragged(item, kind, deltaDays, deltaMinutes, step, zone), moved });
    if (kind === "move" && item.kind === "block") {
      drag.set({ removing: overTaskPane(event.clientX, event.clientY) });
    }
  };

  // Drops the gesture and anything it was showing, without writing.
  const cancel = () => {
    setLive(null);
    setHover(null);
    if (drag.get().removing) drag.set({ removing: false });
  };

  useEffect(() => {
    if (!gesture) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancel();
    };
    // Capture phase, so the key never reaches the command registry (Deselect).
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const onPointerUp = () => {
    const current = live.current;
    setLive(null);
    if (!current) return;
    if (current.kind === "create") {
      // A click makes a default-length block, cut short at midnight like the old grid.
      const dayEnd = instant(dayOf(current.start, zone), DAY_MINUTES, zone);
      const end = current.moved
        ? current.end
        : new Date(Math.min(dayEnd.getTime(), current.start.getTime() + clickLength * 60_000));
      setDraft({ start: current.start, end });
      return;
    }
    const { item } = current;
    if (!current.moved) {
      selectItem(item);
      return;
    }
    if (item.kind === "block") {
      const { removing } = drag.get();
      drag.set({ removing: false });
      if (removing) {
        select(null);
        void actions.deleteBlock(item.block.uuid);
      } else void actions.moveBlock(item.block.uuid, current.start, current.end);
      return;
    }
    // Device events live outside Cal's tables, so the move is recorded as an external
    // History step: ⌘Z puts the event back, ⇧⌘Z moves it again.
    const previous = { start: toOffsetIso(item.start), end: toOffsetIso(item.end) };
    const next = { start: toOffsetIso(current.start), end: toOffsetIso(current.end) };
    const place = (times: typeof next) =>
      window.cal.calendar.updateEvent(item.event.id, times, "this").then(refreshEvents);
    void history.transact(current.kind === "move" ? "Move Event" : "Resize Event", (tx) =>
      tx.external(
        () => place(next),
        () => place(previous),
      ),
    );
  };

  // Items drawn where the gesture has them, plus the original slot shown as an outline.
  const shown =
    gesture && gesture.kind !== "create"
      ? items.map((item) =>
          item.id === gesture.item.id ? { ...item, start: gesture.start, end: gesture.end } : item,
        )
      : items;
  const byDay = segments(shown, days, zone);
  const original =
    gesture && gesture.kind !== "create" && gesture.moved
      ? segments([gesture.item], days, zone)
      : null;
  // The create gesture and the draft, cut per day like items are.
  const creating = gesture?.kind === "create" ? segments([gesture], days, zone) : null;
  const drafting = draft ? segments([draft], days, zone) : null;
  const nowMinute = minutesOf(now, zone);
  const nowFaded = mix(tokens.now[mode], tokens.canvas[mode], 0.65);
  const nowTop = px(nowMinute);
  const showNow = days.includes(today);
  // Labels of an extra column follow the main zone's hour lines on one reference day.
  const reference = days.includes(today) ? today : (days[0] ?? today);
  const hours = Array.from({ length: 23 }, (_, index) => index + 1);
  // Opaque hairline colors; half-hour lines sit halfway between the grid line and the canvas.
  const halfLine = mix(tokens.grid[mode], tokens.canvas[mode], 0.5);
  const { start: workStart, end: workEnd } = account.workingHours;
  const lines = `repeating-linear-gradient(to bottom, var(--cal-grid) 0 1px, transparent 1px ${hour}px)`;
  const halfLines = device.halfHourLines
    ? `, repeating-linear-gradient(to bottom, transparent 0 ${hour / 2}px, ${halfLine} ${hour / 2}px ${hour / 2 + 1}px, transparent ${hour / 2 + 1}px ${hour}px)`
    : "";

  return (
    <div
      ref={bodyRef}
      className="relative flex flex-1 overflow-y-auto overflow-x-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={cancel}
      onPointerLeave={() => setHover(null)}
      data-dense
      data-grid-body
      data-hour={hour.toFixed(2)}
      data-fit={fit.toFixed(2)}
    >
      {extras.map((column) => (
        <div
          key={column.zone}
          className="relative shrink-0 border-r border-grid"
          style={{ width: ZONE_COLUMN, height: dayHeight }}
          data-zone-column={column.zone}
        >
          {hours.map((line) => {
            const at = zonedMinutes(instant(reference, line * 60, zone), column.zone);
            return (
              <div
                key={line}
                className="absolute inset-x-0 text-center text-caption leading-[14px] text-ink-3 tnum"
                style={{
                  top: line * hour - 7,
                  visibility: showNow && Math.abs(line * hour - nowTop) < 16 ? "hidden" : undefined,
                }}
              >
                {formatZoneHour(Math.floor(at / 60), at % 60)}
              </div>
            );
          })}
          {showNow && (
            <div
              className="absolute inset-x-1 flex h-4 items-center justify-center rounded-sm text-caption font-medium text-white tnum"
              style={{ top: nowTop - 8, background: nowFaded }}
            >
              {formatMinutes(zonedMinutes(now, column.zone), true)}
            </div>
          )}
        </div>
      ))}
      <div className="relative shrink-0" style={{ width: GUTTER, height: dayHeight }}>
        {hours.map((line) => (
          <div
            key={line}
            className="absolute right-2 text-caption leading-[14px] text-ink-3 tnum"
            style={{
              top: line * hour - 7,
              visibility: showNow && Math.abs(line * hour - nowTop) < 16 ? "hidden" : undefined,
            }}
          >
            {formatHour(line)}
          </div>
        ))}
        {showNow && (
          <div
            className="absolute right-1.5 flex h-[18px] items-center rounded-sm bg-now px-1 text-caption font-semibold text-white tnum"
            style={{ top: nowTop - 9 }}
          >
            {formatMinutes(nowMinute, true)}
          </div>
        )}
      </div>

      {days.map((day) => {
        const column = byDay.get(day) ?? [];
        const slots = layoutColumn(
          column.map((segment) => ({
            id: segment.item.id,
            start: segment.start,
            end: segment.end,
          })),
        );
        const isToday = day === today;
        const weekend = weekday(day) === 0 || weekday(day) === 6;
        const dayDraft = drafting?.get(day)?.[0] ?? null;
        // A task dragged from the list, or the create gesture's part of this day.
        const dayGhost: Segment<Span> | null =
          ghost?.day === day
            ? {
                item: {
                  start: instant(day, ghost.start, zone),
                  end: instant(day, ghost.end, zone),
                },
                day,
                start: ghost.start,
                end: ghost.end,
              }
            : (creating?.get(day)?.[0] ?? null);
        const dayHover = !gesture && !draft && hover?.day === day ? hover : null;
        const working = weekend ? "var(--cal-offhours)" : "var(--cal-canvas)";
        return (
          <div
            key={day}
            data-column={day}
            className="relative min-w-0 flex-1 border-l border-grid"
            style={{
              height: dayHeight,
              backgroundImage: `${lines}${halfLines}, linear-gradient(to bottom, var(--cal-offhours) 0 ${px(workStart)}px, ${working} ${px(workStart)}px ${px(workEnd)}px, var(--cal-offhours) ${px(workEnd)}px)`,
            }}
          >
            {flashDay === day && (
              <div
                className="flash-out pointer-events-none absolute inset-0 z-10 bg-accent-soft"
                onAnimationEnd={() => ui.set({ flashDay: null })}
              />
            )}
            {original?.get(day)?.map((segment) => (
              <div
                key={`original-${segment.item.id}`}
                className="pointer-events-none absolute inset-x-0.5 rounded-sm border border-dashed border-edge-strong"
                style={{
                  top: px(segment.start),
                  height: px(segment.end - segment.start) - 1,
                }}
              />
            ))}
            {column.map((segment) => {
              const { item } = segment;
              const slot = slots.get(item.id) ?? { left: 0, width: 1, z: 0 };
              const dragging =
                gesture?.kind !== "create" && gesture?.item.id === item.id && gesture.moved;
              const frame = {
                top: px(segment.start),
                height: px(segment.end - segment.start),
                left: slot.left,
                width: slot.width,
                z: dragging ? 30 : slot.z + 1,
              };
              const past = item.end.getTime() < now.getTime();
              const start = minutesOf(item.start, zone);
              const end = minutesOf(item.end, zone);
              return (
                <div key={item.id} data-item={item.id} className="contents">
                  {item.kind === "event" ? (
                    <EventChip
                      title={item.event.title}
                      location={item.event.location}
                      start={start}
                      end={end}
                      colors={palette.get(item.event.calendarId) ?? graphite(mode)}
                      frame={frame}
                      selected={selection?.kind === "event" && selection.id === item.event.id}
                      past={past}
                      dragging={dragging}
                      writable={isWritable(item)}
                    />
                  ) : (
                    <BlockChip
                      block={item.block}
                      task={item.task}
                      project={item.project}
                      start={start}
                      end={end}
                      frame={frame}
                      selected={selection?.kind === "block" && selection.uuid === item.block.uuid}
                      past={past}
                      dragging={dragging}
                    />
                  )}
                </div>
              );
            })}
            {dayGhost && (
              <div
                className="pointer-events-none absolute inset-x-0.5 z-20 rounded-sm border border-dashed border-accent bg-accent-soft px-1.5 pt-0.5 text-small font-medium text-accent"
                style={{
                  top: px(dayGhost.start),
                  height: px(dayGhost.end - dayGhost.start) - 1,
                }}
              >
                <GhostLabel span={dayGhost.item} zone={zone} />
              </div>
            )}
            {dayHover && (
              <div
                className="pointer-events-none absolute inset-x-0.5 z-0 rounded-sm border border-dashed border-edge-strong"
                style={{
                  top: px(dayHover.start),
                  height: px(dayHover.end - dayHover.start) - 1,
                }}
              >
                <span className="absolute right-1 top-0.5 text-caption text-ink-3 tnum">
                  {formatMinutes(dayHover.start)}
                </span>
              </div>
            )}
            {dayDraft && day === dayOf(dayDraft.item.start, zone) && (
              <DraftChip
                draft={dayDraft.item}
                zone={zone}
                onDone={() => setDraft(null)}
                style={frameStyle({
                  top: px(dayDraft.start),
                  height: px(dayDraft.end - dayDraft.start),
                  left: 0,
                  width: 1,
                  z: 25,
                })}
              />
            )}
            {dayDraft && day !== dayOf(dayDraft.item.start, zone) && (
              <div
                className="pointer-events-none absolute inset-x-0.5 z-20 rounded-sm border border-dashed border-accent bg-accent-soft"
                style={{
                  top: px(dayDraft.start),
                  height: px(dayDraft.end - dayDraft.start) - 1,
                }}
              />
            )}
            {showNow && (
              <div
                className="pointer-events-none absolute inset-x-0 z-20 h-px"
                style={{ top: nowTop, background: isToday ? "var(--cal-now)" : nowFaded }}
              >
                {isToday && (
                  <div className="absolute -left-1 -top-[3.5px] h-2 w-2 rounded-full bg-now" />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const selectItem = (item: Item) =>
  select(
    item.kind === "block"
      ? { kind: "block", uuid: item.block.uuid }
      : { kind: "event", id: item.event.id },
  );

function GhostLabel({ span, zone }: { span: Span; zone: string }) {
  const title = useDrag((state) => state.task?.title);
  return (
    <div className="flex flex-col">
      {title && <span className="truncate">{title}</span>}
      <span className="text-caption font-normal tnum">
        {formatMinuteRange(minutesOf(span.start, zone), minutesOf(span.end, zone))}
      </span>
    </div>
  );
}

// The chip being created: type a title, Enter makes a to-do and its block, Escape drops it.
function DraftChip({
  draft,
  zone,
  onDone,
  style,
}: {
  draft: Draft;
  zone: string;
  onDone: () => void;
  style: ReturnType<typeof frameStyle>;
}) {
  const actions = useActions();
  const [title, setTitle] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const commit = async () => {
    const text = title.trim();
    onDone();
    if (!text) return;
    const uuid = await actions.createTask({
      title: text,
      position: -1,
      when: "date",
      when_date: dayOf(draft.start, zone),
      estimate_min: Math.round((draft.end.getTime() - draft.start.getTime()) / 60_000),
    });
    await actions.scheduleTask(uuid, draft.start, draft.end);
  };

  return (
    <div
      className="absolute overflow-hidden rounded-sm border border-accent border-l-[3px] bg-canvas pl-1.5 pr-1 pt-0.5 shadow-drag"
      style={style}
    >
      <input
        ref={ref}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") void commit();
          else if (event.key === "Escape") onDone();
          event.stopPropagation();
        }}
        placeholder="New To-Do"
        aria-label="Title"
        className="w-full bg-transparent text-small font-medium leading-4 text-ink outline-none placeholder:text-ink-3"
      />
      <div className="truncate text-caption text-ink-2 tnum">
        {formatMinuteRange(minutesOf(draft.start, zone), minutesOf(draft.end, zone))}
      </div>
    </div>
  );
}
