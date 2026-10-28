import { useActions } from "@cal/app-core";
import { parseQuickEntry, type TokenKind } from "@cal/nlp";
import { CalendarDays, Flag, Folder, Hourglass, Moon, Zap } from "lucide-react";
import { useState } from "react";
import { useApp } from "../lib/app";
import { now } from "../lib/clock";
import { formatDuration, formatRelativeDay, formatTime } from "../lib/time";
import { closeOverlay } from "../lib/ui";
import { Keycaps, Overlay } from "./ui";

/*
 * ⇧⌘N: one line of natural language. Recognized parts light up as you type and are
 * listed as chips underneath; Enter creates the to-do (and a block when a time was
 * given). Tokens: tomorrow · tonight · !fri · ~45m · p1 · /project.
 */

const TOKEN_ICONS: Record<TokenKind, typeof Flag> = {
  when: CalendarDays,
  evening: Moon,
  deadline: Flag,
  estimate: Hourglass,
  priority: Zap,
  project: Folder,
};

export function QuickEntry() {
  const { data, today } = useApp();
  const actions = useActions();
  const [text, setText] = useState("");
  const entry = parseQuickEntry(text, now(), data.projects);
  const project = data.projects.find((each) => each.uuid === entry.project_uuid);

  const chips: { kind: TokenKind; label: string }[] = [];
  if (entry.when === "evening") chips.push({ kind: "evening", label: "This Evening" });
  else if (entry.when === "date" && entry.when_date) {
    chips.push({
      kind: "when",
      label: entry.start_at
        ? `${formatRelativeDay(entry.when_date, today)} ${formatTime(entry.start_at)}`
        : formatRelativeDay(entry.when_date, today),
    });
  } else if (entry.when)
    chips.push({ kind: "when", label: entry.when === "someday" ? "Someday" : "Anytime" });
  if (entry.deadline)
    chips.push({ kind: "deadline", label: `Due ${formatRelativeDay(entry.deadline, today)}` });
  if (entry.estimate_min)
    chips.push({ kind: "estimate", label: formatDuration(entry.estimate_min) });
  if (entry.priority) chips.push({ kind: "priority", label: `P${entry.priority}` });
  if (project) chips.push({ kind: "project", label: project.title });

  const submit = async () => {
    if (!entry.title) return;
    closeOverlay();
    const { tokens: _tokens, title, start_at, ...fields } = entry;
    const uuid = await actions.createTask({
      title,
      position: -1,
      ...fields,
      when: fields.when ?? "inbox",
    });
    if (start_at) {
      const end = new Date(start_at.getTime() + (entry.estimate_min ?? 30) * 60_000);
      await actions.scheduleTask(uuid, start_at, end);
    }
  };

  // The input's text is transparent; a mirror underneath draws the same text with highlights.
  const pieces: { text: string; kind?: TokenKind }[] = [];
  let cursor = 0;
  for (const token of entry.tokens) {
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
        {chips.map(({ kind, label }) => {
          const Icon = TOKEN_ICONS[kind];
          return (
            <span
              key={kind}
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
