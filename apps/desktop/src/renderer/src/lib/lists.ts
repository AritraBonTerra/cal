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
import type { NewRow, RowPatch } from "@cal/sync";
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

// Open tasks of `list` in display order; Today puts This Evening last.
export function tasksIn(list: ListId, tasks: readonly Task[], today: DayKey) {
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
    return rows.sort(
      (a, b) => (b.completed_at ?? b.canceled_at ?? 0) - (a.completed_at ?? a.canceled_at ?? 0),
    );
  }
  rows.sort(byPosition);
  if (list === "today") {
    const evening = rows.filter((task) => isThisEvening(task, today));
    return [...rows.filter((task) => !evening.includes(task)), ...evening];
  }
  if (list === "upcoming")
    rows.sort((a, b) => (a.when_date ?? "").localeCompare(b.when_date ?? "") || byPosition(a, b));
  return rows;
}

// A list's title; a project or area still waiting for one reads "New Project" or "New Area".
export function listTitle(list: ListId, projects: readonly Project[], areas: readonly Area[]) {
  if (isSmartList(list)) return SMART_TITLES[list];
  const uuid = list.slice(list.indexOf(":") + 1);
  if (list.startsWith("project:")) {
    const project = projects.find((each) => each.uuid === uuid);
    return project ? project.title || "New Project" : "";
  }
  const area = areas.find((each) => each.uuid === uuid);
  return area ? area.title || "New Area" : "";
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

// The area a project made while `list` is showing goes into: that area, or the area of
// that project; none from a smart list or a project outside any area.
export function areaForNewProject(list: ListId, projects: readonly Project[]) {
  if (list.startsWith("area:")) return list.slice("area:".length);
  if (!list.startsWith("project:")) return undefined;
  const uuid = list.slice("project:".length);
  return projects.find((project) => project.uuid === uuid)?.area_uuid;
}

/**
 * The fields that move a to-do into a project or an area (the Move menu). A to-do holds
 * one or the other, and one leaving the Inbox this way goes to Anytime, as in Things.
 */
export function moveInto(task: Task, target: { project: string } | { area: string }) {
  const patch: RowPatch<"tasks"> =
    "project" in target
      ? { project_uuid: target.project, area_uuid: null }
      : { area_uuid: target.area, project_uuid: null };
  return task.when === "inbox" ? { ...patch, when: "anytime" as const } : patch;
}
