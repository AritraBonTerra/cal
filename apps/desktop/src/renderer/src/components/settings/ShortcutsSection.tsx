import {
  type BoundCommand,
  bindingFor,
  commandsUsing,
  normalizeBinding,
  sameKeys,
  searchShortcuts,
  useCal,
  useCommandList,
  useSettings,
  withKeys,
} from "@cal/app-core";
import { Plus, TriangleAlert, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { isMac, keyInput } from "../../lib/keyboard";
import { pauseMenuKeys, shortcutText } from "../../lib/shortcuts";
import { Keycaps } from "../ui";
import { Group, RowButton } from "./controls";

/*
 * Settings > Shortcuts: every command with its keys, grouped like the `?` sheet. Click a
 * binding to record a new one; the next key press saves at once. Overrides are stored
 * in the `keybindings` account setting, which syncs, and only where they differ from
 * the command's own keys.
 */

const GROUP_ORDER = ["View", "Navigate", "To-Do", "Calendar", "General"];
const MAX_KEYS = 4;

// The binding being recorded: command `id`'s key at `index`, or a new one at the end.
interface Recording {
  id: string;
  index: number;
}

// "A", "A and B", "A, B and C".
const listOf = (names: readonly string[]) =>
  names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

// Bindings written out for a note: "⇧⌘N", "⌫ or ⌦".
const keysText = (keys: readonly string[]) => keys.map(shortcutText).join(" or ");

// The 22 "Show N days" commands past 9 have no keys; they show only when searched for.
const quietDays = (command: BoundCommand) =>
  /^view\.days\.\d+$/.test(command.id) &&
  command.keys.length === 0 &&
  command.defaultKeys.length === 0;

export function ShortcutsSection() {
  const { commands } = useCal();
  const listed = useCommandList(true);
  const { account, setAccount } = useSettings();
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState<Recording | null>(null);

  const save = (command: BoundCommand, keys: readonly string[]) =>
    void setAccount(
      "keybindings",
      withKeys(account.keybindings, command.id, keys, command.defaultKeys),
    );

  // While recording, every key goes to the recorder: captured before anything else sees
  // it, so no command runs and Escape cancels rather than closing Settings.
  useEffect(() => {
    if (!recording) return;
    const command = listed.find((each) => each.id === recording.id);
    if (!command) return;
    pauseMenuKeys(commands, true);
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const input = keyInput(event);
      const bare = !input.metaKey && !input.ctrlKey && !input.altKey && !input.shiftKey;
      if (event.key === "Escape" && bare) {
        setRecording(null);
        return;
      }
      const binding = bindingFor(input, isMac);
      if (!binding) return;
      // The new key takes the recorded place; a copy of it elsewhere in the list goes.
      const wanted = normalizeBinding(binding);
      const keys = command.keys.filter(
        (key, index) => index !== recording.index && normalizeBinding(key) !== wanted,
      );
      keys.splice(Math.min(recording.index, keys.length), 0, binding);
      save(command, keys);
      setRecording(null);
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-recording]")) return;
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
      pauseMenuKeys(commands, false);
    };
  });

  const shown = searchShortcuts(listed, query, isMac).filter(
    (command) => query.trim() !== "" || !quietDays(command),
  );
  const names = [...new Set([...GROUP_ORDER, ...shown.map((command) => command.group ?? "Other")])];
  const groups = names
    .map((group) => ({
      group,
      commands: shown.filter((command) => (command.group ?? "Other") === group),
    }))
    .filter((entry) => entry.commands.length > 0);

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Escape clears the search first, then closes Settings.
            if (event.key === "Escape" && query) {
              event.preventDefault();
              setQuery("");
            }
          }}
          placeholder="Search shortcuts"
          aria-label="Search shortcuts"
          className="h-6 min-w-0 flex-1 rounded-md bg-hover px-2 text-body text-ink outline-none placeholder:text-ink-3"
        />
        <RowButton
          onClick={() => void setAccount("keybindings", {})}
          disabled={Object.keys(account.keybindings).length === 0}
        >
          Reset all
        </RowButton>
      </div>
      {groups.map(({ group, commands: list }) => (
        <Group key={group} title={group}>
          {list.map((command) => (
            <ShortcutRow
              key={command.id}
              command={command}
              conflicts={conflictsOf(command, listed)}
              recording={recording?.id === command.id ? recording.index : null}
              onRecord={(index) => setRecording({ id: command.id, index })}
              onChange={(keys) => save(command, keys)}
            />
          ))}
        </Group>
      ))}
      {groups.length === 0 && (
        <div className="py-6 text-center text-small text-ink-3">No matching shortcuts</div>
      )}
    </>
  );
}

/**
 * The other commands sharing a key the user gave `command`. Keys it has by default are
 * left out: several commands share one on purpose (Return opens a to-do or an event).
 */
function conflictsOf(command: BoundCommand, commands: readonly BoundCommand[]) {
  const defaults = new Set(command.defaultKeys.map(normalizeBinding));
  const added = command.keys.filter((binding) => !defaults.has(normalizeBinding(binding)));
  const titles = added.flatMap((binding) =>
    commandsUsing(commands, binding, command.id).map((other) => other.title),
  );
  return [...new Set(titles)];
}

interface ShortcutRowProps {
  command: BoundCommand;
  conflicts: readonly string[];
  // The key being recorded, or null.
  recording: number | null;
  onRecord: (index: number) => void;
  onChange: (keys: readonly string[]) => void;
}

// One command: its title and context or change note, and its bindings as buttons.
function ShortcutRow({ command, conflicts, recording, onRecord, onChange }: ShortcutRowProps) {
  const { keys, defaultKeys } = command;
  const changed = !sameKeys(keys, defaultKeys);
  const ref = useRef<HTMLDivElement>(null);
  const was = useRef<number | null>(null);

  // When recording ends, focus goes back to the binding it was on (or what replaced it).
  useEffect(() => {
    const index = was.current;
    was.current = recording;
    if (recording !== null || index === null) return;
    const buttons = ref.current?.querySelectorAll<HTMLElement>("[data-key], [data-add]");
    const target = buttons?.[Math.min(index, buttons.length - 1)];
    target?.focus();
  }, [recording]);

  return (
    <div
      ref={ref}
      data-command={command.id}
      className="group flex min-h-11 items-center gap-4 px-3 py-2 [&+&]:border-t [&+&]:border-grid"
    >
      <div className="min-w-0 flex-1">
        <div className="text-body text-ink">{command.title}</div>
        {conflicts.length > 0 && (
          <div className="flex items-center gap-1 text-small text-ink-2" data-conflict>
            <TriangleAlert
              size={12}
              strokeWidth={1.5}
              absoluteStrokeWidth
              className="shrink-0 text-warning"
            />
            Also used by {listOf(conflicts)}
          </div>
        )}
        {changed ? (
          <div className="text-small text-ink-3">
            Changed.{" "}
            {defaultKeys.length > 0 ? `Default ${keysText(defaultKeys)}.` : "No default shortcut."}{" "}
            <button
              type="button"
              onClick={() => onChange(defaultKeys)}
              className="font-medium text-accent"
            >
              Reset
            </button>
          </div>
        ) : (
          command.when && <div className="text-small text-ink-3">{command.when}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {keys.map((binding, index) => (
          <Fragment key={binding}>
            {index > 0 && <span className="text-caption text-ink-3">or</span>}
            {recording === index ? (
              <Recorder />
            ) : (
              <span className="relative">
                <button
                  type="button"
                  data-key
                  aria-label={`Change shortcut ${shortcutText(binding)} for ${command.title}`}
                  onClick={() => onRecord(index)}
                  className="flex h-6 items-center rounded-md px-1 transition-colors duration-100 hover:bg-hover hover:duration-0"
                >
                  <Keycaps binding={binding} />
                </button>
                <button
                  type="button"
                  aria-label={`Remove shortcut ${shortcutText(binding)}`}
                  onClick={() => onChange(keys.filter((_, each) => each !== index))}
                  className="absolute -top-1 -right-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-raised text-ink-2 shadow-[0_0_0_0.5px_var(--cal-edge-strong),0_1px_2px_oklch(0_0_0/0.08)] hover:text-ink group-focus-within:flex group-hover:flex"
                >
                  <X size={8} strokeWidth={2} absoluteStrokeWidth />
                </button>
              </span>
            )}
          </Fragment>
        ))}
        {recording === keys.length && (
          <>
            {keys.length > 0 && <span className="text-caption text-ink-3">or</span>}
            <Recorder />
          </>
        )}
        {keys.length === 0 && recording === null && (
          <button
            type="button"
            data-add
            onClick={() => onRecord(0)}
            className="h-6 rounded-md px-2 text-small text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink hover:duration-0"
          >
            Add shortcut
          </button>
        )}
        {keys.length > 0 && keys.length < MAX_KEYS && recording === null ? (
          <button
            type="button"
            data-add
            aria-label={`Add another shortcut for ${command.title}`}
            onClick={() => onRecord(keys.length)}
            className="invisible flex h-6 w-6 items-center justify-center rounded-md text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink hover:duration-0 group-focus-within:visible group-hover:visible"
          >
            <Plus size={12} strokeWidth={1.5} absoluteStrokeWidth />
          </button>
        ) : (
          <span className="w-6" />
        )}
      </div>
    </div>
  );
}

// The accent-ringed pill that stands in for a binding while its keys are recorded.
function Recorder() {
  return (
    <span
      data-recording
      role="status"
      className="flex h-6 items-center gap-1.5 rounded-full px-2.5 text-small text-ink shadow-[inset_0_0_0_1.5px_var(--cal-accent)]"
    >
      Press keys…
      <span className="text-ink-3">Esc cancels</span>
    </span>
  );
}
