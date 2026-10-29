import { useActions } from "@cal/app-core";
import type { Project, Task, TimeBlock } from "@cal/domain";
import { blockColors, type ChipColors } from "@cal/theme";
import { Lock, MapPin } from "lucide-react";
import { useApp } from "../../lib/app";
import { hueFor } from "../../lib/data";
import { formatMinuteRange, formatMinutes } from "../../lib/time";
import { Checkbox } from "../ui";

/*
 * Chips on the time grid (research/07 §7.6). Events are a pale fill with a 3px bar;
 * task blocks are lighter, with a checkbox and a project stripe. Text is top-aligned,
 * and what shows depends on height: 12px gets a title only, 24px one line with the
 * time, 36px or more the title and a time range. Times arrive as minutes after midnight
 * in the grid's zone.
 */

export interface Frame {
  top: number;
  height: number;
  left: number;
  width: number;
  z: number;
}

export const frameStyle = ({ top, height, left, width, z }: Frame) => ({
  top,
  height: Math.max(12, height - 1),
  left: `calc(${left * 100}% + ${left > 0 ? 1 : 0}px)`,
  width: `calc(${width * 100}% - ${left + width < 1 ? 3 : 2}px)`,
  zIndex: z,
});

// Invisible 6px bands at the top and bottom edges that start a resize.
function Handles() {
  return (
    <>
      <div data-edge="start" className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize" />
      <div data-edge="end" className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize" />
    </>
  );
}

interface EventChipProps {
  title: string;
  location?: string;
  start: number;
  end: number;
  colors: ChipColors;
  frame: Frame;
  selected: boolean;
  past: boolean;
  dragging: boolean;
  writable: boolean;
}

export function EventChip({
  title,
  location,
  start,
  end,
  colors,
  frame,
  selected,
  past,
  dragging,
  writable,
}: EventChipProps) {
  const { height } = frame;
  const fill = selected ? colors.solid : past ? colors.pastFill : colors.fill;
  const text = selected ? "#ffffff" : past ? colors.pastTitle : colors.title;
  const time = selected ? "oklch(1 0 0 / 0.85)" : past ? colors.pastTime : colors.time;
  return (
    <div
      className={`absolute overflow-hidden rounded-sm border-l-[3px] pl-1.5 pr-1 ${
        dragging ? "shadow-drag" : ""
      } ${height <= 12 ? "pt-0" : "pt-0.5"}`}
      style={{
        ...frameStyle(frame),
        background: fill,
        borderColor: selected ? colors.solid : past ? colors.pastTime : colors.bar,
        boxShadow: selected ? undefined : "0 0 0 1px var(--cal-canvas)",
      }}
      data-selected={selected || undefined}
    >
      {height < 30 ? (
        <div
          className="flex items-baseline gap-1 truncate text-small leading-[12px]"
          style={{ color: text, fontSize: height <= 12 ? 11 : undefined }}
        >
          <span className="truncate font-medium">{title}</span>
          {height >= 20 && (
            <span className="shrink-0 text-caption tnum" style={{ color: time }}>
              {formatMinutes(start)}
            </span>
          )}
        </div>
      ) : (
        <>
          <div className="truncate text-small font-medium leading-4" style={{ color: text }}>
            {title}
          </div>
          <div
            className="flex items-center gap-1 truncate text-caption tnum"
            style={{ color: time }}
          >
            {formatMinuteRange(start, end)}
            {location && height >= 48 && (
              <>
                <MapPin
                  size={11}
                  strokeWidth={1.5}
                  absoluteStrokeWidth
                  className="ml-0.5 shrink-0"
                />
                <span className="truncate">{location}</span>
              </>
            )}
          </div>
        </>
      )}
      {writable && <Handles />}
    </div>
  );
}

interface BlockChipProps {
  block: TimeBlock;
  task?: Task;
  project?: Project;
  start: number;
  end: number;
  frame: Frame;
  selected: boolean;
  past: boolean;
  dragging: boolean;
}

export function BlockChip({
  block,
  task,
  project,
  start,
  end,
  frame,
  selected,
  past,
  dragging,
}: BlockChipProps) {
  const { mode } = useApp();
  const actions = useActions();
  const { height } = frame;
  const done = block.done_at !== undefined;
  const colors = project ? blockColors(hueFor(project), mode) : null;
  const unfinished = past && !done;
  return (
    <div
      className={`absolute overflow-hidden rounded-sm border border-l-[3px] pl-1.5 pr-1 ${
        unfinished ? "hatched" : ""
      } ${selected ? "bg-accent-soft" : mode === "light" ? "bg-canvas" : "bg-raised"} ${
        dragging ? "shadow-drag" : ""
      } ${height <= 12 ? "pt-0" : "pt-0.5"}`}
      style={{
        ...frameStyle(frame),
        borderColor: colors?.border ?? "var(--cal-edge)",
        borderLeftColor: colors?.stripe ?? "var(--cal-edge-strong)",
        boxShadow: selected ? "inset 0 0 0 2px var(--cal-accent)" : undefined,
      }}
      data-selected={selected || undefined}
    >
      <div className="flex items-center gap-1.5 text-small leading-4">
        {height >= 20 && (
          <Checkbox
            checked={done}
            size={12}
            label={done ? "Reopen" : "Complete"}
            onChange={(checked) => void actions.setBlockDone(block, checked)}
          />
        )}
        <span
          className={`truncate font-medium ${
            done ? "text-ink-3 line-through" : unfinished ? "text-ink-2" : "text-ink"
          }`}
          style={height <= 12 ? { fontSize: 11, lineHeight: "12px" } : undefined}
        >
          {task?.title ?? "Block"}
        </span>
        {block.pinned_at !== undefined && height >= 20 && (
          <Lock
            size={11}
            strokeWidth={1.5}
            absoluteStrokeWidth
            className="ml-auto shrink-0 text-ink-3"
          />
        )}
      </div>
      {height >= 30 && (
        <div className="truncate text-caption text-ink-2 tnum">{formatMinuteRange(start, end)}</div>
      )}
      <Handles />
    </div>
  );
}
