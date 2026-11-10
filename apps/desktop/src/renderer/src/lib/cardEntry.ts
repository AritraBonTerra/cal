import { entryFields } from "@cal/app-core";
import type { Task } from "@cal/domain";
import { parseQuickEntry, type TaskEntry } from "@cal/nlp";
import type { Literal } from "./entryText";

/*
 * How a new to-do's card reads its title as Quick Entry text: the parse itself, shared
 * by the live highlights and the save on close, and the to-do as the chips preview it.
 */

// What the parse needs from the app: `/name` projects, the week start, the grid's zone.
export interface CardParseContext {
  projects: readonly { uuid: string; title: string }[];
  weekStartsOn: number;
  timeZone: string;
}

// Parses a new card's title as a to-do typed in a list, keeping `literals` as text.
export function parseCardTitle(
  title: string,
  literals: readonly Literal[],
  context: CardParseContext,
  now: Date,
): TaskEntry {
  return parseQuickEntry(title, {
    now,
    kind: "task",
    surface: "list",
    projects: context.projects,
    literals,
    weekStartsOn: context.weekStartsOn,
    timeZone: context.timeZone,
  });
}

/**
 * The to-do as it will be once `entry` is applied, for the chip row: the fields the
 * text names over the to-do's own. A typed project hides the area, as it will be cleared.
 */
export function previewTask(task: Task, entry: TaskEntry): Task {
  const preview: Task = { ...task, ...entryFields(entry) };
  if (entry.project_uuid) delete preview.area_uuid;
  return preview;
}
