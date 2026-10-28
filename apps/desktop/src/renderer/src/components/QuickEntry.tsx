import { useActions } from "@cal/app-core";
import { parseQuickEntry, type TokenKind } from "@cal/nlp";
import {
  Bell,
  CalendarDays,
  Clock,
  Flag,
  Folder,
  Hash,
  Hourglass,
  Moon,
  Repeat,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useApp } from "../lib/app";
import { now } from "../lib/clock";
import { closeOverlay } from "../lib/ui";
import { Keycaps, Overlay } from "./ui";

/*
 * ⇧⌘N: one line of natural language. Recognized parts light up as you type and are
 * listed as chips underneath; Enter creates the to-do (and a block when a time was
 * given). Tokens: tomorrow · tonight · !fri · ~45m · p1 · /project.
 */

const TOKEN_ICONS: Partial<Record<TokenKind, typeof Flag>> = {
  when: CalendarDays,
  date_range: CalendarDays,
  time: Clock,
  time_range: Clock,
  evening: Moon,
  later: CalendarDays,
  deadline: Flag,
  estimate: Hourglass,
  duration: Hourglass,
  priority: Zap,
  list: Folder,
  tag: Hash,
  recurrence: Repeat,
  reminder: Bell,
};

export function QuickEntry() {
  const { data } = useApp();
  const actions = useActions();
  const [text, setText] = useState("");
  const entry = parseQuickEntry(text, {
    now: now(),
    surface: "quick",
    kind: "task",
    projects: data.projects,
  });
  const chips = entry.tokens.filter((token) => token.applied && token.kind !== "mode");

  const submit = async () => {
    if (!entry.title) return;
    closeOverlay();
    await actions.createFromEntry(entry);
  };

  // The input's text is transparent; a mirror underneath draws the same text with highlights.
  const pieces: { text: string; kind?: TokenKind }[] = [];
  let cursor = 0;
  for (const token of entry.tokens.filter((each) => each.applied)) {
    if (token.start > cursor) pieces.push({ text: text.slice(cursor, token.start) });
    pieces.push({ text: text.slice(token.start, token.end), kind: token.kind });
    cursor = token.end;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor) });

  return (
    <Overlay onClose={closeOverlay} width={640} label="Quick Entry">
      <div className="relative h-11 border-b border-grid">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center whitespace-pre px-4 text-title-3 text-ink"
        >
          {pieces.map((piece, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: pieces are positional text.
              key={index}
              className={piece.kind ? "rounded-xs bg-accent-soft text-accent" : ""}
            >
              {piece.text}
            </span>
          ))}
        </div>
        <input
          // biome-ignore lint/a11y/noAutofocus: Quick Entry exists to be typed into.
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
            else if (event.key === "Escape") closeOverlay();
            else return;
            event.preventDefault();
          }}
          placeholder="New to-do, e.g. Call the movers tomorrow 3pm ~30m !fri /launch"
          aria-label="New to-do"
          spellCheck={false}
          className="relative h-11 w-full bg-transparent px-4 text-title-3 text-transparent caret-ink outline-none placeholder:text-ink-3"
        />
      </div>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 px-4 py-2">
        {chips.length === 0 && (
          <span className="text-small text-ink-3">
            Try <span className="text-ink-2">tomorrow</span>,{" "}
            <span className="text-ink-2">tonight</span>, <span className="text-ink-2">!fri</span>,{" "}
            <span className="text-ink-2">~45m</span>, <span className="text-ink-2">p1</span>,{" "}
            <span className="text-ink-2">/project</span>
          </span>
        )}
        {chips.map(({ kind, label, start }) => {
          const Icon = TOKEN_ICONS[kind] ?? CalendarDays;
          return (
            <span
              key={start}
              className="flex h-6 items-center gap-1 rounded-md bg-hover px-2 text-small font-medium text-ink-2 tnum"
            >
              <Icon size={12} strokeWidth={1.5} absoluteStrokeWidth />
              {label}
            </span>
          );
        })}
      </div>
      <footer className="flex h-8 items-center gap-4 border-t border-grid px-4 text-caption text-ink-3">
        <span className="flex items-center gap-1">
          <Keycaps binding="enter" /> Add to-do
        </span>
        <span className="flex items-center gap-1">
          <Keycaps binding="escape" /> Cancel
        </span>
        {entry.title && <span className="ml-auto truncate text-ink-2">“{entry.title}”</span>}
      </footer>
    </Overlay>
  );
}
