import type { EventSpan } from "@cal/calendar-source";
import { useEffect, useRef, useState } from "react";
import { useSpanQuestion } from "../lib/events";
import { Keycaps } from "./ui";

/*
 * The small "This event / This and following / All events" question for repeating
 * events (research/08 §D), asked before a save, move, resize or delete. ↑↓ move,
 * ↩ chooses, Esc leaves the event as it was.
 */

const LABELS: Record<EventSpan, string> = {
  this: "This event",
  future: "This and following events",
  all: "All events",
};

export function SpanDialog() {
  const question = useSpanQuestion();
  if (!question) return null;
  return <Dialog key={question.title} question={question} />;
}

function Dialog({ question }: { question: NonNullable<ReturnType<typeof useSpanQuestion>> }) {
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const { options, resolve, title } = question;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[oklch(0_0_0/0.18)]"
      style={{ paddingTop: "28vh" }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) resolve(null);
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-label="Repeating event"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") resolve(null);
          else if (event.key === "Enter") resolve(options[cursor] ?? null);
          else if (event.key === "ArrowDown")
            setCursor((value) => Math.min(options.length - 1, value + 1));
          else if (event.key === "ArrowUp") setCursor((value) => Math.max(0, value - 1));
          else if (/^[1-3]$/.test(event.key)) resolve(options[Number(event.key) - 1] ?? null);
          else {
            event.stopPropagation();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
        }}
        className="pop-in w-80 overflow-hidden rounded-xl bg-raised text-ink shadow-float outline-none"
      >
        <div className="px-4 pt-3 pb-2 text-title-3 font-semibold">{title}</div>
        <div className="px-2 pb-2" role="radiogroup" aria-label="Which events">
          {options.map((span, index) => {
            const active = index === cursor;
            return (
              // biome-ignore lint/a11y/useSemanticElements: a list of choices, not a form radio.
              <button
                type="button"
                role="radio"
                aria-checked={active}
                key={span}
                onMouseMove={() => setCursor(index)}
                onClick={() => resolve(span)}
                className={`relative flex h-8 w-full items-center gap-3 rounded-md px-3 text-left text-body ${
                  active ? "bg-hover" : ""
                }`}
              >
                {active && (
                  <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-accent" />
                )}
                <span className="flex-1">{LABELS[span]}</span>
                <Keycaps binding={String(index + 1)} />
              </button>
            );
          })}
        </div>
        <footer className="flex h-8 items-center gap-4 border-t border-grid px-4 text-caption text-ink-3">
          <span className="flex items-center gap-1">
            <Keycaps binding="enter" /> Choose
          </span>
          <span className="flex items-center gap-1">
            <Keycaps binding="escape" /> Cancel
          </span>
        </footer>
      </div>
    </div>
  );
}
