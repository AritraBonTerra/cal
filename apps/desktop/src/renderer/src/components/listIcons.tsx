import type { SmartList } from "@cal/domain";
import { Archive, CalendarRange, CheckCircle2, Inbox, Layers, Star } from "lucide-react";

// Icons for the lists a to-do can live in, shared by the sidebar and the to-do bar's Move menu.

export const SMART_ICONS: Record<SmartList, typeof Inbox> = {
  inbox: Inbox,
  today: Star,
  upcoming: CalendarRange,
  anytime: Layers,
  someday: Archive,
  logbook: CheckCircle2,
};

// Things' project pie: a ring that fills as the project completes.
export function ProjectRing({ done, total }: { done: number; total: number }) {
  const fraction = total === 0 ? 0 : done / total;
  const r = 5;
  const c = 2 * Math.PI * r;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-accent" aria-hidden>
      <circle cx="8" cy="8" r={r + 1.25} fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={r * 2}
        strokeDasharray={`${c * fraction} ${c}`}
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}
