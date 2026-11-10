import { useActions } from "@cal/app-core";
import { byPosition, isOpen, isOverdue, type Task } from "@cal/domain";
import type { RowPatch } from "@cal/sync";
import {
  Archive,
  Box,
  CalendarDays,
  ChartPie,
  CircleDashed,
  Clock,
  Flag,
  Hash,
  Layers,
  Moon,
  Star,
  X,
} from "lucide-react";
import { type MouseEvent, type Ref, useEffect, useRef, useState } from "react";
import { useApp } from "../lib/app";
import { cardText, closeCard, saveCardText, useCardText } from "../lib/card";
import { parseDurationText } from "../lib/clockText";
import { parseTags, tagNames } from "../lib/tags";
import { formatDuration, formatRelativeDay } from "../lib/time";
import { toggleOverlay, useUi } from "../lib/ui";
import { Checkbox } from "./ui";
import { MonthGrid, Option, Popover, WhenPicker } from "./WhenPicker";

/*
 * A to-do opened in place into a card (Things' way): the title, notes that grow with
 * their text, and a row of chips for When, Deadline, Estimate, Project and Tags. It
 * replaces the row's content inside the same list item, so rows below move down and
 * nothing above moves. Escape, ⌘↩, Return in the title, or a press outside closes it;
 * lib/card.ts saves the text, and each chip saves its own field as one undo step.
 */
export function TaskCard({ task }: { task: Task }) {
  const actions = useActions();
  const title = useCardText((state) => state.title);
  const notes = useCardText((state) => state.notes);
  const ref = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const done = !isOpen(task);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
    const away = (event: PointerEvent) => {
      if (!(event.target instanceof Node && ref.current?.contains(event.target))) closeCard();
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the card's keys close it; its fields are the controls.
    <div
      ref={ref}
      data-card
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeCard();
        }
        // Single keys belong to the card's fields, never to the window's shortcuts;
        // ⌘ combinations (⌘↩, ⌘S, ⌘Z) go on to the keyboard router.
        if (!event.metaKey && !event.ctrlKey) event.stopPropagation();
      }}
      className="my-1 rounded-lg bg-raised p-3 shadow-float"
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-[18px] items-center">
          <Checkbox
            checked={done}
            onChange={(checked) => void actions.setTaskDone(task.uuid, checked)}
            label={done ? "Reopen" : "Complete"}
          />
        </div>
        <div className="min-w-0 flex-1">
          <input
            ref={titleRef}
            value={title}
            onChange={(event) => cardText.set({ title: event.target.value })}
            onBlur={() => saveCardText(actions)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
                event.preventDefault();
                closeCard();
              }
            }}
            placeholder="New To-Do"
            aria-label="Title"
            className={`w-full bg-transparent text-body font-medium outline-none placeholder:text-ink-3 ${
              done ? "text-ink-3 line-through" : "text-ink"
            }`}
          />
          <textarea
            value={notes}
            onChange={(event) => cardText.set({ notes: event.target.value })}
            onBlur={() => saveCardText(actions)}
            rows={1}
            placeholder="Notes"
            aria-label="Notes"
            className="mt-1 block w-full resize-none bg-transparent text-body text-ink-2 outline-none field-sizing-content placeholder:text-ink-3"
          />
        </div>
      </div>
      <Chips task={task} />
    </div>
  );
}

type Menu = "deadline" | "project";

// The card's chip row. Its popovers open under the row, left-aligned with it, so they
// stay inside the pane whichever chip opened them.
function Chips({ task }: { task: Task }) {
  const { data, today } = useApp();
  const actions = useActions();
  const whenOpen = useUi((state) => state.overlay === "when");
  const [menu, setMenu] = useState<Menu | null>(null);
  const update = (patch: RowPatch<"tasks">, label: string) =>
    void actions.updateTask(task.uuid, patch, label);
  const project = data.projects.find((each) => each.uuid === task.project_uuid);
  const area = data.areas.find((each) => each.uuid === task.area_uuid);
  const when = whenChip(task, today);
  const tags = tagNames(task.tags);
  // Pressing a chip whose popover is open closes it, rather than letting the popover's
  // outside-press close it and the click open it again.
  const toggle = (next: Menu) => setMenu((current) => (current === next ? null : next));
  // The chip whose popover is or was open: once a choice closes the popover, the keyboard
  // goes back to that chip rather than to the window, so Escape still closes the card.
  const opener = useRef<HTMLButtonElement | null>(null);
  const opened = (event: MouseEvent<HTMLButtonElement>) => {
    opener.current = event.currentTarget;
  };
  useEffect(() => {
    if (!whenOpen && !menu && document.activeElement === document.body) opener.current?.focus();
  }, [whenOpen, menu]);

  return (
    <div className="relative mt-3 flex flex-wrap gap-1.5">
      <Chip
        icon={when.icon}
        label={when.label}
        quiet={when.quiet}
        open={whenOpen}
        onClick={(event) => {
          opened(event);
          setMenu(null);
          toggleOverlay("when");
        }}
      />
      <Chip
        icon={Flag}
        label={task.deadline ? formatRelativeDay(task.deadline, today) : "Deadline"}
        quiet={!task.deadline}
        tone={isOverdue(task, today) ? "text-now" : undefined}
        open={menu === "deadline"}
        onClick={(event) => {
          opened(event);
          toggle("deadline");
        }}
      />
      <TextChip
        icon={Clock}
        label="Estimate"
        value={task.estimate_min === undefined ? "" : formatDuration(task.estimate_min)}
        onCommit={(text) => {
          const minutes = text.trim() ? parseDurationText(text) : undefined;
          if (text.trim() && !minutes) return;
          if (minutes !== task.estimate_min) {
            update({ estimate_min: minutes ?? null }, "Set Estimate");
          }
        }}
      />
      <Chip
        icon={project ? ChartPie : area ? Box : ChartPie}
        label={project?.title ?? area?.title ?? "Project"}
        quiet={!project && !area}
        open={menu === "project"}
        onClick={(event) => {
          opened(event);
          toggle("project");
        }}
      />
      <TextChip
        icon={Hash}
        label="Tags"
        value={tags.join(" ")}
        display={tags.map((name) => `#${name}`).join(" ")}
        onCommit={(text) => {
          const next = parseTags(text);
          if (next !== (task.tags ?? "")) update({ tags: next || null }, "Set Tags");
        }}
      />

      {whenOpen && <WhenPicker task={task} />}
      {menu === "deadline" && (
        <Popover label="Deadline" onClose={() => setMenu(null)}>
          <div className="px-2 pt-2 pb-1">
            <MonthGrid
              value={task.deadline}
              today={today}
              onPick={(day) => {
                setMenu(null);
                update({ deadline: day }, "Set Deadline");
              }}
            />
          </div>
          {task.deadline && (
            <div className="mt-1 border-t border-grid pt-1">
              <Option
                icon={X}
                label="Clear Deadline"
                active={false}
                onClick={() => {
                  setMenu(null);
                  update({ deadline: null }, "Clear Deadline");
                }}
              />
            </div>
          )}
        </Popover>
      )}
      {menu === "project" && (
        <ProjectMenu
          task={task}
          onPick={(patch) => {
            setMenu(null);
            update(patch, "Move to Project");
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

// What the When chip says: Today, This Evening, a day, Anytime, Someday, or a quiet
// "When" for an Inbox to-do.
function whenChip(task: Task, today: string) {
  switch (task.when) {
    case "date":
      return !task.when_date || task.when_date <= today
        ? { icon: Star, label: "Today", quiet: false }
        : { icon: CalendarDays, label: formatRelativeDay(task.when_date, today), quiet: false };
    case "evening":
      return task.when_date && task.when_date > today
        ? {
            icon: Moon,
            label: `${formatRelativeDay(task.when_date, today)} Evening`,
            quiet: false,
          }
        : { icon: Moon, label: "This Evening", quiet: false };
    case "anytime":
      return { icon: Layers, label: "Anytime", quiet: false };
    case "someday":
      return { icon: Archive, label: "Someday", quiet: false };
    case "inbox":
      return { icon: CalendarDays, label: "When", quiet: true };
  }
}

const PILL =
  "inline-flex h-[22px] max-w-full items-center gap-1 rounded-full px-2 text-small shadow-[inset_0_0_0_1px_var(--cal-edge)]";

/**
 * A 22px pill: an icon and the field's value, or a quiet label when it has none, so
 * every field can be set from the card. `open` marks the chip whose popover is showing.
 */
function Chip({
  ref,
  icon: Icon,
  label,
  quiet,
  tone,
  open = false,
  onClick,
}: {
  ref?: Ref<HTMLButtonElement>;
  icon: typeof Flag;
  label: string;
  quiet: boolean;
  // A text color for a value that needs attention (an overdue deadline).
  tone?: string;
  open?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={open}
      onPointerDown={(event) => {
        if (open) event.stopPropagation();
      }}
      onClick={onClick}
      className={`${PILL} transition-colors duration-100 hover:bg-hover hover:duration-0 ${
        open ? "bg-active" : ""
      } ${tone ?? (quiet ? "text-ink-3" : "text-ink-2")}`}
    >
      <Icon size={12} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0" />
      <span className="truncate tnum">{label}</span>
    </button>
  );
}

/**
 * A chip that turns into a text field when pressed (Estimate: "45m", "1h30"; Tags:
 * "design, admin"). Return or leaving the field saves, Escape cancels; either way
 * the keyboard lands back on the chip.
 */
function TextChip({
  icon: Icon,
  label,
  value,
  display = value,
  onCommit,
}: {
  icon: typeof Flag;
  label: string;
  // The text the field starts with; `display` is what the chip shows.
  value: string;
  display?: string;
  onCommit: (text: string) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (text === null && refocus.current) {
      refocus.current = false;
      button.current?.focus();
    }
  }, [text]);

  // Ends the edit once, whether by key or by blur.
  const finish = (save: boolean) => {
    if (text === null) return;
    if (save) onCommit(text);
    setText(null);
  };

  if (text !== null) {
    return (
      <span className={`${PILL} text-ink-2`}>
        <Icon size={12} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0" />
        <input
          // biome-ignore lint/a11y/noAutofocus: the field appears because the chip was pressed.
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              refocus.current = true;
              finish(event.key === "Enter");
            }
          }}
          placeholder={label}
          aria-label={label}
          className="min-w-12 bg-transparent text-small text-ink outline-none field-sizing-content placeholder:text-ink-3"
        />
      </span>
    );
  }
  return (
    <Chip
      ref={button}
      icon={Icon}
      label={display || label}
      quiet={!display}
      onClick={() => setText(value)}
    />
  );
}

// The Project chip's menu: No Project, then each area followed by its open projects.
function ProjectMenu({
  task,
  onPick,
  onClose,
}: {
  task: Task;
  onPick: (patch: RowPatch<"tasks">) => void;
  onClose: () => void;
}) {
  const { data } = useApp();
  const openProjects = data.projects
    .filter((project) => project.completed_at === undefined && project.canceled_at === undefined)
    .sort(byPosition);
  const loose = openProjects.filter((project) => !project.area_uuid);
  const areas = [...data.areas].filter((area) => area.archived_at === undefined).sort(byPosition);
  // Projects inside an area are indented under it.
  const projectRow = (project: (typeof openProjects)[number], indent: boolean) => (
    <div key={project.uuid} className={indent ? "pl-4" : undefined}>
      <Option
        icon={ChartPie}
        label={project.title}
        active={task.project_uuid === project.uuid}
        onClick={() => onPick({ project_uuid: project.uuid, area_uuid: null })}
      />
    </div>
  );
  return (
    <Popover label="Project" onClose={onClose}>
      <div className="max-h-64 overflow-y-auto">
        <Option
          icon={CircleDashed}
          label="No Project"
          active={!task.project_uuid && !task.area_uuid}
          onClick={() => onPick({ project_uuid: null, area_uuid: null })}
        />
        {loose.map((project) => projectRow(project, false))}
        {areas.map((area) => (
          <div key={area.uuid}>
            <Option
              icon={Box}
              label={area.title}
              active={!task.project_uuid && task.area_uuid === area.uuid}
              onClick={() => onPick({ project_uuid: null, area_uuid: area.uuid })}
            />
            {openProjects
              .filter((project) => project.area_uuid === area.uuid)
              .map((project) => projectRow(project, true))}
          </div>
        ))}
      </div>
    </Popover>
  );
}
