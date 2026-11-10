import { useActions, useCal } from "@cal/app-core";
import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useApp } from "../lib/app";
import { emptyHabit, type HabitDraft, type HabitSchedule, habitRow } from "../lib/habits";
import { closeOverlay } from "../lib/ui";
import { IconButton, Keycaps, Overlay, Segmented } from "./ui";

/*
 * New Habit… (⌘K, or the + beside the habit strip): a title, how often (every day,
 * specific weekdays, N times per week or month, or every N days) and whether it's done
 * or measured toward a target. Enter creates it in the day strip; Escape cancels.
 */

const SCHEDULES: readonly { value: HabitSchedule; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "On days" },
  { value: "quota", label: "Times per" },
  { value: "interval", label: "Every N days" },
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const inputClass =
  "h-7 rounded-md bg-canvas px-2 text-body text-ink shadow-[inset_0_0_0_1px_var(--cal-edge)] outline-none placeholder:text-ink-3 focus:shadow-[inset_0_0_0_1px_var(--cal-accent)]";

export function NewHabit() {
  const { account } = useApp();
  const actions = useActions();
  const [draft, setDraft] = useState<HabitDraft>(emptyHabit);
  const row = habitRow(draft);
  const set = (patch: Partial<HabitDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const week = Array.from({ length: 7 }, (_, index) => (account.weekStart + index) % 7);

  const create = () => {
    if (!row) return;
    closeOverlay();
    void actions.createHabit(row);
  };

  return (
    <Overlay onClose={closeOverlay} width={440} label="New Habit">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: routes Enter and Escape for the whole form. */}
      <div
        onKeyDown={(event) => {
          // Keys stay in the form: typing never runs the window's shortcuts.
          event.stopPropagation();
          if (event.key === "Enter") create();
          else if (event.key === "Escape") closeOverlay();
          else return;
          event.preventDefault();
        }}
      >
        <div className="flex flex-col gap-3 p-4">
          <h2 className="text-title-3 font-semibold text-ink">New Habit</h2>
          <input
            // biome-ignore lint/a11y/noAutofocus: the form opens to be typed into.
            autoFocus
            value={draft.title}
            onChange={(event) => set({ title: event.target.value })}
            placeholder="Read, Gym, Meditate…"
            aria-label="Title"
            className={inputClass}
          />
          <Field label="Repeat">
            <Segmented
              value={draft.schedule}
              options={SCHEDULES}
              onChange={(schedule) => set({ schedule })}
              label="Repeat"
            />
          </Field>
          {draft.schedule === "weekdays" && (
            <Field label="">
              <div className="flex gap-1">
                {week.map((day) => {
                  const on = draft.weekdays.includes(day);
                  return (
                    <button
                      type="button"
                      key={day}
                      aria-pressed={on}
                      aria-label={WEEKDAYS[day]}
                      onClick={() =>
                        set({
                          weekdays: on
                            ? draft.weekdays.filter((each) => each !== day)
                            : [...draft.weekdays, day],
                        })
                      }
                      className={`h-6 w-8 rounded-md text-small ${
                        on
                          ? "bg-accent-soft font-medium text-accent"
                          : "text-ink-2 shadow-[inset_0_0_0_1px_var(--cal-edge)] hover:bg-hover"
                      }`}
                    >
                      {WEEKDAYS[day]?.slice(0, 2)}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
          {draft.schedule === "quota" && (
            <Field label="">
              <NumberInput value={draft.count} onChange={(count) => set({ count })} label="Times" />
              <span className="text-small text-ink-2">times per</span>
              <Segmented
                value={draft.period}
                options={[
                  { value: "week", label: "Week" },
                  { value: "month", label: "Month" },
                ]}
                onChange={(period) => set({ period })}
                label="Period"
              />
            </Field>
          )}
          {draft.schedule === "interval" && (
            <Field label="">
              <span className="text-small text-ink-2">Every</span>
              <NumberInput value={draft.every} onChange={(every) => set({ every })} label="Days" />
              <span className="text-small text-ink-2">days</span>
            </Field>
          )}
          <Field label="Track">
            <Segmented
              value={draft.measured ? "measure" : "check"}
              options={[
                { value: "check", label: "Done or not" },
                { value: "measure", label: "An amount" },
              ]}
              onChange={(kind) => set({ measured: kind === "measure" })}
              label="Track"
            />
          </Field>
          {draft.measured && (
            <Field label="">
              <span className="text-small text-ink-2">Target</span>
              <NumberInput
                value={draft.target}
                onChange={(target) => set({ target })}
                label="Target"
              />
              <input
                value={draft.unit}
                onChange={(event) => set({ unit: event.target.value })}
                placeholder="min, pages…"
                aria-label="Unit"
                className={`${inputClass} w-28`}
              />
            </Field>
          )}
        </div>
        <div className="flex h-11 items-center gap-4 border-t border-grid px-4 text-caption text-ink-3">
          <span className="flex items-center gap-1">
            <Keycaps binding="enter" /> Create
          </span>
          <span className="flex items-center gap-1">
            <Keycaps binding="escape" /> Cancel
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={closeOverlay}
            className="h-7 rounded-md px-3 text-small font-medium text-ink shadow-[inset_0_0_0_1px_var(--cal-edge)] hover:bg-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!row}
            onClick={create}
            className="h-7 rounded-md bg-accent-solid px-3 text-small font-medium text-white disabled:bg-active disabled:text-ink-3"
          >
            Create
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// A form line: a 56px label column, then the controls in a row.
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center gap-2">
      <span className="w-14 shrink-0 text-small text-ink-2">{label}</span>
      {children}
    </div>
  );
}

// A short field for a whole number (counts, days, targets).
function NumberInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputMode="decimal"
      aria-label={label}
      className={`${inputClass} w-12 text-center tnum`}
    />
  );
}

// The + in the gutter cell beside the habit strip, `width` wide; runs New Habit….
export function NewHabitButton({ width }: { width: number }) {
  const { commands } = useCal();
  return (
    <div className="flex shrink-0 items-center justify-end pr-1" style={{ width }}>
      <IconButton label="New Habit…" onClick={() => commands.run("habit.new")}>
        <Plus size={16} strokeWidth={1.5} absoluteStrokeWidth />
      </IconButton>
    </div>
  );
}
