import { type Command, searchCommands, useCommandList } from "@cal/app-core";
import {
  ArrowRight,
  Calendar,
  CircleCheck,
  LayoutGrid,
  type LucideIcon,
  Terminal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { closeOverlay } from "../lib/ui";
import { Keycaps, Overlay } from "./ui";

/*
 * ⌘K: every command with its shortcut, fuzzy-matched as you type. Day counts that have
 * no key of their own ("Show 14 days") appear once a number is typed. Opens with no
 * animation and runs the selected command on Enter.
 */

const GROUP_ICONS: Record<string, LucideIcon> = {
  View: LayoutGrid,
  Navigate: ArrowRight,
  "To-Do": CircleCheck,
  Calendar: Calendar,
  General: Terminal,
};

const GROUP_ORDER = ["To-Do", "Calendar", "View", "Navigate", "General"];

const isSpareDayCount = (command: Command) => /^view\.days\.(1\d|2\d|3[01])$/.test(command.id);

export function Palette() {
  const commands = useCommandList();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const pool = query.trim() ? commands : commands.filter((command) => !isSpareDayCount(command));
  const results = searchCommands(pool, query);
  const ordered = query.trim()
    ? results
    : [...results].sort(
        (a, b) => GROUP_ORDER.indexOf(a.group ?? "") - GROUP_ORDER.indexOf(b.group ?? ""),
      );
  const current = ordered[Math.min(cursor, ordered.length - 1)];

  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls whenever the cursor or results move.
  useEffect(() => {
    listRef.current?.querySelector("[aria-selected=true]")?.scrollIntoView({ block: "nearest" });
  }, [cursor, query]);

  const run = (command: Command | undefined) => {
    closeOverlay();
    command?.run();
  };

  return (
    <Overlay onClose={closeOverlay} width={640} label="Command menu">
      <input
        // biome-ignore lint/a11y/noAutofocus: the palette exists to be typed into.
        autoFocus
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setCursor(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown")
            setCursor((value) => Math.min(ordered.length - 1, value + 1));
          else if (event.key === "ArrowUp") setCursor((value) => Math.max(0, value - 1));
          else if (event.key === "Enter") run(current);
          else if (event.key === "Escape") closeOverlay();
          else if (event.key === "k" && event.metaKey) closeOverlay();
          else return;
          event.preventDefault();
        }}
        placeholder="Type a command or search…"
        aria-label="Command"
        className="h-11 w-full border-b border-grid bg-transparent px-4 text-title-3 text-ink outline-none placeholder:text-ink-3"
      />
      <div ref={listRef} role="listbox" className="max-h-[calc(70vh-76px)] overflow-y-auto p-2">
        {ordered.length === 0 && (
          <div className="px-3 py-6 text-center text-small text-ink-3">No matching commands</div>
        )}
        {ordered.map((command, index) => {
          const Icon = GROUP_ICONS[command.group ?? ""] ?? Terminal;
          const showGroup = !query.trim() && command.group !== ordered[index - 1]?.group;
          const selected = command === current;
          return (
            <div key={command.id}>
              {showGroup && (
                <div className="px-3 pt-2 pb-1 text-caption font-medium text-ink-3">
                  {command.group}
                </div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onMouseMove={() => setCursor(index)}
                onClick={() => run(command)}
                className={`relative flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-body ${
                  selected ? "bg-hover text-ink" : "text-ink"
                }`}
              >
                {selected && (
                  <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-accent" />
                )}
                <Icon
                  size={14}
                  strokeWidth={1.5}
                  absoluteStrokeWidth
                  className="shrink-0 text-ink-2"
                />
                <span className="flex-1 truncate">{command.title}</span>
                {command.keys?.[0] && <Keycaps binding={command.keys[0]} />}
              </button>
            </div>
          );
        })}
      </div>
      <footer className="flex h-8 items-center gap-4 border-t border-grid px-4 text-caption text-ink-3">
        <span className="flex items-center gap-1">
          <Keycaps binding="enter" /> Run
        </span>
        <span className="flex items-center gap-1">
          <Keycaps binding="arrowup" />
          <Keycaps binding="arrowdown" /> Move
        </span>
        <span className="flex items-center gap-1">
          <Keycaps binding="escape" /> Close
        </span>
      </footer>
    </Overlay>
  );
}
