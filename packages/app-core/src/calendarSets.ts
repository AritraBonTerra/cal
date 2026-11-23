/*
 * Calendar sets: named groups of calendars, one shown at a time (PLAN §5.1). A set may
 * have hours, when "Automatic" picks it. Kept per device, as calendar ids are.
 */

export interface CalendarSet {
  id: string;
  name: string;
  // Calendar ids.
  calendars: readonly string[];
  // When Automatic shows it: days (0 = Sunday) and minutes after midnight.
  hours?: { days: readonly number[]; start: number; end: number };
}

// What's shown: a set by id, every calendar, or the set whose hours it is.
export type SetChoice = "auto" | "all" | (string & {});

/** The set in force, or undefined for every calendar. Automatic takes the first that fits. */
export function activeSet(sets: readonly CalendarSet[], choice: SetChoice, now: Date) {
  if (choice === "all") return undefined;
  if (choice !== "auto") return sets.find((set) => set.id === choice);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return sets.find(
    ({ hours }) =>
      hours?.days.includes(now.getDay()) && hours.start <= minutes && minutes < hours.end,
  );
}

/** The calendars not showing: those hidden by hand, and those outside the set in force. */
export const hiddenWith = (
  set: CalendarSet | undefined,
  calendars: readonly { id: string }[],
  hidden: readonly string[],
): readonly string[] =>
  set
    ? [
        ...new Set([
          ...hidden,
          ...calendars.map(({ id }) => id).filter((id) => !set.calendars.includes(id)),
        ]),
      ]
    : hidden;
