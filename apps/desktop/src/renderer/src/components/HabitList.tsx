import { useActions, useCal } from "@cal/app-core";
import { dayStatuses } from "@cal/domain";
import { habitColors } from "@cal/theme";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useApp } from "../lib/app";
import { now } from "../lib/clock";
import { hueFor } from "../lib/data";
import { activeHabits, habitDay, habitProgress } from "../lib/habits";
import { HabitRing } from "./habitRing";
import { ROW } from "./Sidebar";
import { ContextMenu } from "./ui";

/*
 * The sidebar's Habits: a header whose + runs New Habit…, then one row per habit that
 * isn't archived with today's ring, the title and today's progress ("15/20 min", "2/3").
 * Click a row to toggle today, as today's chip in the day strip does; right-click it to
 * archive. With no habits it says so, so there's always a labelled place to add one.
 */
export function HabitList() {
  const { data, today, mode } = useApp();
  const actions = useActions();
  const { commands } = useCal();
  const [menu, setMenu] = useState<{ x: number; y: number; uuid: string } | null>(null);
  const habits = activeHabits(data.habits);
  return (
    <section className="mt-5" data-habit-list>
      <div className="flex h-7 items-center pl-2 text-small text-ink-3">
        <span className="flex-1">Habits</span>
        <button
          type="button"
          aria-label="New Habit…"
          title="New Habit…"
          onClick={() => commands.run("habit.new")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-ink-2 transition-colors duration-100 hover:bg-hover hover:duration-0 active:bg-active"
        >
          <Plus size={14} strokeWidth={1.5} absoluteStrokeWidth />
        </button>
      </div>
      {habits.length === 0 ? (
        <p className="flex h-7 items-center px-2 text-small text-ink-3">No habits yet</p>
      ) : (
        <ul>
          {habits.map((habit) => {
            const { done, fraction, toggle } = habitDay(habit, data.entries, today);
            const status = dayStatuses(habit, data.entries, today, today).get(today) ?? "open";
            const progress = habitProgress(habit, data.entries, today);
            return (
              <li key={habit.uuid}>
                <button
                  type="button"
                  aria-pressed={done}
                  onClick={() => void actions.logHabit(habit.uuid, today, toggle)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({ x: event.clientX, y: event.clientY, uuid: habit.uuid });
                  }}
                  className={`${ROW} text-ink hover:bg-hover`}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    <HabitRing
                      fraction={fraction}
                      status={status}
                      color={habitColors(hueFor(habit), mode).ring}
                    />
                  </span>
                  <span className="flex-1 truncate">{habit.title}</span>
                  {progress && <span className="text-caption text-ink-3 tnum">{progress}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Archive",
              run: () =>
                void actions.updateHabit(
                  menu.uuid,
                  { archived_at: now().getTime() },
                  "Archive Habit",
                ),
            },
          ]}
        />
      )}
    </section>
  );
}
