import { useTable } from "@cal/app-core";
import type { Project } from "@cal/domain";

/*
 * The app tables every view reads, in one hook so `loaded` means all of them. Rows are
 * live: the hook re-renders when a table changes locally or through sync.
 */
export function useData() {
  const tasks = useTable("tasks");
  const blocks = useTable("time_blocks");
  const projects = useTable("projects");
  const areas = useTable("areas");
  const habits = useTable("habits");
  const entries = useTable("habit_entries");
  return {
    tasks: tasks.rows,
    blocks: blocks.rows,
    projects: projects.rows,
    areas: areas.rows,
    habits: habits.rows,
    entries: entries.rows,
    loaded: [tasks, blocks, projects, areas, habits, entries].every((table) => table.loaded),
  };
}

// Hues for project stripes and habit rings: spread around the wheel, none near the
// "now" red, and hashed from the title so they're stable across devices and relaunches.
const HUES = [255, 150, 60, 300, 190, 95, 230, 320];

export function hueFor(record: Pick<Project, "title">) {
  let hash = 0;
  for (const char of record.title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return HUES[hash % HUES.length] ?? 255;
}
