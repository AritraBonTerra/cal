/*
 * The command list behind ⌘K, the menus and keyboard shortcuts. Views register the
 * commands that make sense while they're showing; the registry matches key presses and
 * lists everything for the palette and the `?` shortcut sheet. No DOM here: platforms
 * turn their key events into `KeyInput`.
 */

export interface Command {
  id: string;
  title: string;
  // Palette section, e.g. "View", "Navigate", "To-Do".
  group?: string;
  // Bindings such as "mod+k", "shift+arrowright", "1". `mod` is ⌘ on Mac, Ctrl elsewhere.
  keys?: readonly string[];
  // Extra words the palette matches, e.g. "zoom" for a view command.
  aliases?: readonly string[];
  run: () => void;
  // Hidden from the palette and inert when this returns false.
  enabled?: () => boolean;
}

export interface KeyInput {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

interface Binding {
  key: string;
  mod: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

const KEY_NAMES: Record<string, string> = {
  esc: "escape",
  return: "enter",
  space: " ",
  left: "arrowleft",
  right: "arrowright",
  up: "arrowup",
  down: "arrowdown",
  del: "backspace",
};

function parseBinding(binding: string): Binding {
  const parts = binding.toLowerCase().split("+");
  const key = parts.pop() ?? "";
  return {
    key: KEY_NAMES[key] ?? key,
    mod: parts.includes("mod"),
    ctrl: parts.includes("ctrl"),
    alt: parts.includes("alt"),
    shift: parts.includes("shift"),
  };
}

// Punctuation typed without ⇧ on common layouts, so `mod+,` must not fire for ⇧⌘,.
const UNSHIFTED_PUNCTUATION = ",./;'[]\\-=`";

/**
 * Whether `input` triggers `binding`. Shift is part of the binding: `?` matches with
 * or without shift (it's shifted on most layouts), but `t` doesn't match `shift+t` and
 * `mod+,` doesn't match `mod+shift+,`.
 */
export function matches(binding: string, input: KeyInput, mac: boolean) {
  const want = parseBinding(binding);
  const key = input.key.toLowerCase();
  const printableShifted =
    want.key.length === 1 &&
    !/[a-z0-9]/.test(want.key) &&
    !UNSHIFTED_PUNCTUATION.includes(want.key);
  return (
    key === want.key &&
    (mac ? input.metaKey : input.ctrlKey) === want.mod &&
    (mac ? input.ctrlKey === want.ctrl : true) &&
    input.altKey === want.alt &&
    (printableShifted || input.shiftKey === want.shift)
  );
}

const SYMBOLS: Record<string, string> = {
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  enter: "↵",
  escape: "Esc",
  backspace: "⌫",
  delete: "⌦",
  " ": "Space",
};

// Keycap labels for a binding, e.g. "mod+shift+k" → ["⌘", "⇧", "K"] on Mac.
export function keyLabels(binding: string, mac: boolean) {
  const { key, mod, ctrl, alt, shift } = parseBinding(binding);
  const labels: string[] = [];
  if (ctrl) labels.push(mac ? "⌃" : "Ctrl");
  if (alt) labels.push(mac ? "⌥" : "Alt");
  if (shift) labels.push(mac ? "⇧" : "Shift");
  if (mod) labels.push(mac ? "⌘" : "Ctrl");
  labels.push(SYMBOLS[key] ?? key.toUpperCase());
  return labels;
}

/**
 * Registered commands, newest registration first so a focused view can override a
 * global binding while it's mounted.
 */
export class CommandRegistry {
  private layers: { commands: readonly Command[] }[] = [];
  private readonly listeners = new Set<() => void>();
  // Bumped on every registration change, for useSyncExternalStore.
  version = 0;

  register(commands: readonly Command[]) {
    const layer = { commands };
    this.layers = [layer, ...this.layers];
    this.emit();
    return () => {
      this.layers = this.layers.filter((each) => each !== layer);
      this.emit();
    };
  }

  // Every enabled command once by id, for the palette; `includeDisabled` lists them all
  // for the shortcut sheet.
  list(includeDisabled = false) {
    const seen = new Set<string>();
    const all: Command[] = [];
    for (const { commands } of this.layers) {
      for (const command of commands) {
        if (seen.has(command.id) || (!includeDisabled && command.enabled?.() === false)) continue;
        seen.add(command.id);
        all.push(command);
      }
    }
    return all;
  }

  // Runs the command bound to `input`, if any. Returns whether one ran.
  handle(input: KeyInput, mac: boolean) {
    const command = this.list().find((each) =>
      each.keys?.some((binding) => matches(binding, input, mac)),
    );
    command?.run();
    return command !== undefined;
  }

  run(id: string) {
    const command = this.list().find((each) => each.id === id);
    command?.run();
    return command !== undefined;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}

/**
 * Ranks `commands` against palette text: every word must match the start of a word in
 * the title, group or aliases. Title-prefix matches come first.
 */
export function searchCommands(commands: readonly Command[], text: string) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...commands];
  const scored = commands.flatMap((command) => {
    const haystack = [command.title, command.group ?? "", ...(command.aliases ?? [])]
      .join(" ")
      .toLowerCase();
    const starts = haystack.split(/[\s/-]+/);
    if (!words.every((word) => starts.some((start) => start.startsWith(word)))) return [];
    const title = command.title.toLowerCase();
    return [{ command, score: title.startsWith(words.join(" ")) ? 0 : 1 }];
  });
  return scored.sort((a, b) => a.score - b.score).map(({ command }) => command);
}
