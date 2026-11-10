import {
  type Area,
  addDays,
  byPosition,
  type DayKey,
  inList,
  isOpen,
  isThisEvening,
  type Project,
  type SmartList,
  type Task,
} from "@cal/domain";
import type { NewRow } from "@cal/sync";
import type { ListId } from "./ui";

/*
 * What each sidebar entry shows: smart lists are filters over dates and completion;
 * a project or area lists its open tasks. Both the to-do pane and the keyboard
 * commands read the same ordering, so ↑/↓ follow what's on screen.
 */

export const SMART_LISTS: readonly SmartList[] = [
  "inbox",
  "today",
  "upcoming",
  "anytime",
  "someday",
  "logbook",
];

export const SMART_TITLES: Record<SmartList, string> = {
  inbox: "Inbox",
  today: "Today",
  upcoming: "Upcoming",
  anytime: "Anytime",
  someday: "Someday",
  logbook: "Logbook",
};

export const isSmartList = (list: ListId): list is SmartList =>
  (SMART_LISTS as readonly string[]).includes(list);

/*
 * A list as the pane draws it: sections in order, each with its rows. A section without
 * a heading is "plain"; Today ends with This Evening.
 */
export type Section = { kind: "plain"; rows: Task[] } | { kind: "evening"; rows: Task[] };

// The sections of `list` in display order. Empty sections are left out.
export function listSections(list: ListId, tasks: readonly Task[], today: DayKey): Section[] {
  let rows: Task[];
  if (isSmartList(list)) rows = tasks.filter((task) => inList(task, list, today));
  else if (list.startsWith("project:")) {
    const uuid = list.slice("project:".length);
    rows = tasks.filter((task) => isOpen(task) && task.project_uuid === uuid);
  } else {
    const uuid = list.slice("area:".length);
    rows = tasks.filter((task) => isOpen(task) && task.area_uuid === uuid);
  }
  if (list === "logbook") {
    rows.sort(
      (a, b) => (b.completed_at ?? b.canceled_at ?? 0) - (a.completed_at ?? a.canceled_at ?? 0),
    );
  } else if (list === "upcoming") {
    rows.sort((a, b) => (a.when_date ?? "").localeCompare(b.when_date ?? "") || byPosition(a, b));
  } else rows.sort(byPosition);
  const sections: Section[] =
    list === "today"
      ? [
          { kind: "plain", rows: rows.filter((task) => !isThisEvening(task, today)) },
          { kind: "evening", rows: rows.filter((task) => isThisEvening(task, today)) },
        ]
      : [{ kind: "plain", rows }];
  return sections.filter((section) => section.rows.length > 0);
}

// Open tasks of `list` in display order: the rows of its sections, top to bottom.
export const tasksIn = (list: ListId, tasks: readonly Task[], today: DayKey) =>
  listSections(list, tasks, today).flatMap((section) => section.rows);

export function listTitle(list: ListId, projects: readonly Project[], areas: readonly Area[]) {
  if (isSmartList(list)) return SMART_TITLES[list];
  const uuid = list.slice(list.indexOf(":") + 1);
  return (
    projects.find((project) => project.uuid === uuid)?.title ??
    areas.find((area) => area.uuid === uuid)?.title ??
    ""
  );
}

// Fields a task created inside `list` starts with, so ⌘N lands where you're looking.
export function newTaskIn(list: ListId, today: DayKey): Omit<NewRow<"tasks">, "title"> {
  const base = { position: -1 };
  switch (list) {
    case "today":
      return { ...base, when: "date", when_date: today };
    case "upcoming":
      // Tomorrow, the first day Upcoming shows, so the new row appears where you are.
      return { ...base, when: "date", when_date: addDays(today, 1) };
    case "anytime":
      return { ...base, when: "anytime" };
    case "someday":
      return { ...base, when: "someday" };
    case "inbox":
    case "logbook":
      return { ...base, when: "inbox" };
  }
  const uuid = list.slice(list.indexOf(":") + 1);
  return list.startsWith("project:")
    ? { ...base, when: "anytime", project_uuid: uuid }
    : { ...base, when: "anytime", area_uuid: uuid };
}
