/*
 * The command list behind ⌘K, the menus and keyboard shortcuts. Views register the
 * commands that make sense while they're showing; the registry matches key presses and
 * lists everything for the palette and the `?` shortcut sheet. The user can rebind any
 * command (Keybindings, an account setting); the registry applies those over each
 * command's own keys. No DOM here: platforms turn their key events into `KeyInput`.
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
  // The context the command needs, for Settings > Shortcuts, e.g. "A to-do is selected".
  when?: string;
}

// The user's shortcut overrides by command id. An entry replaces that command's keys;
// an empty array leaves it without a shortcut.
export type Keybindings = Record<string, readonly string[]>;

// A command as the registry lists it: `keys` are the ones in effect, `defaultKeys` the
// command's own.
export type BoundCommand = Command & {
  keys: readonly string[];
  defaultKeys: readonly string[];
};

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
  plus: "+",
};

// Key names a stored binding spells out, where the key itself would read badly or clash
// with the "+" separator.
const SPELLED: Record<string, string> = { " ": "space", "+": "plus" };

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

// A character that usually needs ⇧ to type (`?`, `!`), so bindings ignore ⇧ for it.
const printableShifted = (key: string) =>
  key.length === 1 && !/[a-z0-9]/.test(key) && !UNSHIFTED_PUNCTUATION.includes(key);

// The canonical spelling: modifiers in a fixed order, then the key ("mod+shift+k").
function formatBinding({ key, mod, ctrl, alt, shift }: Binding) {
  const parts = [
    mod && "mod",
    ctrl && "ctrl",
    alt && "alt",
    shift && !printableShifted(key) && "shift",
  ];
  return [...parts.filter(Boolean), SPELLED[key] ?? key].join("+");
}

// One spelling per binding, so "Mod+Shift+K" and "shift+mod+k" compare equal.
export function normalizeBinding(binding: string) {
  return formatBinding(parseBinding(binding));
}

// Whether two key lists are the same bindings in the same order.
export function sameKeys(a: readonly string[], b: readonly string[]) {
  return (
    a.length === b.length &&
    a.every((binding, index) => normalizeBinding(binding) === normalizeBinding(b[index] ?? ""))
  );
}

// Key values that are only a modifier, or no usable key at all.
const NOT_KEYS = new Set([
  "",
  "meta",
  "control",
  "alt",
  "altgraph",
  "shift",
  "capslock",
  "fn",
  "fnlock",
  "os",
  "hyper",
  "super",
  "dead",
  "process",
  "unidentified",
]);

/**
 * The binding a key press would trigger, in canonical form ("mod+shift+k"), or null for
 * a press of a modifier alone. `matches(bindingFor(input), input)` always holds.
 */
export function bindingFor(input: KeyInput, mac: boolean): string | null {
  const key = input.key.toLowerCase();
  if (NOT_KEYS.has(key)) return null;
  return formatBinding({
    key,
    mod: mac ? input.metaKey : input.ctrlKey,
    ctrl: mac && input.ctrlKey,
    alt: input.altKey,
    shift: input.shiftKey,
  });
}

/**
 * Whether `input` triggers `binding`. Shift is part of the binding: `?` matches with
 * or without shift (it's shifted on most layouts), but `t` doesn't match `shift+t` and
 * `mod+,` doesn't match `mod+shift+,`.
 */
export function matches(binding: string, input: KeyInput, mac: boolean) {
  const want = parseBinding(binding);
  const key = input.key.toLowerCase();
  return (
    key === want.key &&
    (mac ? input.metaKey : input.ctrlKey) === want.mod &&
    (mac ? input.ctrlKey === want.ctrl : true) &&
    input.altKey === want.alt &&
    (printableShifted(want.key) || input.shiftKey === want.shift)
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
  tab: "⇥",
  " ": "Space",
  home: "Home",
  end: "End",
  pageup: "PgUp",
  pagedown: "PgDn",
  // A true minus sign, as wide as the "+" it sits beside.
  "-": "−",
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
 * global binding while it's mounted. The user's Keybindings apply over every command.
 */
export class CommandRegistry {
  private layers: { commands: readonly Command[] }[] = [];
  private overrides: Keybindings = {};
  private readonly listeners = new Set<() => void>();
  // Bumped on every registration or binding change, for useSyncExternalStore.
  version = 0;

  // Applies the user's overrides; a change re-lists every command.
  setBindings(overrides: Keybindings) {
    if (JSON.stringify(overrides) === JSON.stringify(this.overrides)) return;
    this.overrides = overrides;
    this.emit();
  }

  get bindings() {
    return this.overrides;
  }

  // The keys in effect for `id`: the override, else the registered command's own.
  keysFor(id: string): readonly string[] | undefined {
    if (Object.hasOwn(this.overrides, id)) return this.overrides[id];
    return this.list(true).find((command) => command.id === id)?.keys;
  }

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
    const all: BoundCommand[] = [];
    for (const { commands } of this.layers) {
      for (const command of commands) {
        if (seen.has(command.id) || (!includeDisabled && command.enabled?.() === false)) continue;
        seen.add(command.id);
        const defaultKeys = command.keys ?? [];
        const keys = Object.hasOwn(this.overrides, command.id)
          ? (this.overrides[command.id] ?? defaultKeys)
          : defaultKeys;
        all.push({ ...command, keys, defaultKeys });
      }
    }
    return all;
  }

  // Runs the command bound to `input`, if any. Returns whether one ran.
  handle(input: KeyInput, mac: boolean) {
    const command = this.list().find((each) =>
      each.keys.some((binding) => matches(binding, input, mac)),
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
export function searchCommands<T extends Command>(commands: readonly T[], text: string) {
  // Split like the haystack, so "to-do" finds "To-Do".
  const words = text
    .toLowerCase()
    .split(/[\s/-]+/)
    .filter(Boolean);
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

/**
 * `bindings` with command `id` set to `keys`. Keys equal to the command's defaults drop
 * the entry, so only real changes are stored.
 */
export function withKeys(
  bindings: Keybindings,
  id: string,
  keys: readonly string[],
  defaultKeys: readonly string[],
): Keybindings {
  const rest = Object.fromEntries(Object.entries(bindings).filter(([each]) => each !== id));
  return sameKeys(keys, defaultKeys) ? rest : { ...rest, [id]: keys.map(normalizeBinding) };
}

// The commands other than `except` whose keys include `binding`, for a conflict note.
export function commandsUsing<T extends { id: string; keys?: readonly string[] }>(
  commands: readonly T[],
  binding: string,
  except?: string,
) {
  const wanted = normalizeBinding(binding);
  return commands.filter(
    (command) =>
      command.id !== except &&
      (command.keys ?? []).some((each) => normalizeBinding(each) === wanted),
  );
}

// What a typed symbol or word stands for in a binding, for searching by keys.
const KEY_SYMBOLS: Record<string, string> = {
  "⌘": "mod",
  "⇧": "shift",
  "⌥": "alt",
  "⌃": "ctrl",
  "←": "arrowleft",
  "→": "arrowright",
  "↑": "arrowup",
  "↓": "arrowdown",
  "↵": "enter",
  "⌫": "backspace",
  "⌦": "delete",
  "⇥": "tab",
  // The keycap shows ⌘− with a true minus; searching for it finds the "-" binding.
  "−": "-",
};
const KEY_WORDS: Record<string, string> = {
  cmd: "mod",
  command: "mod",
  meta: "mod",
  opt: "alt",
  option: "alt",
  control: "ctrl",
};

// The binding parts typed in `text`: "⌘N" and "cmd n" both give ["mod", "n"].
function keyTokens(text: string, mac: boolean) {
  const tokens: string[] = [];
  for (const chunk of text
    .toLowerCase()
    .split(/[\s+]+/)
    .filter(Boolean)) {
    let word = "";
    const flush = () => {
      if (!word) return;
      const named = KEY_WORDS[word] ?? KEY_NAMES[word] ?? word;
      // Bindings name Ctrl `mod` off the Mac.
      tokens.push(named === "ctrl" && !mac ? "mod" : named);
      word = "";
    };
    for (const char of chunk) {
      const symbol = KEY_SYMBOLS[char];
      if (symbol) {
        flush();
        tokens.push(symbol);
      } else word += char;
    }
    flush();
  }
  return tokens;
}

/**
 * Commands matching `text` for Settings > Shortcuts: by title, group and aliases like
 * the palette, then by keys, so "⌘N" or "cmd n" finds what ⌘N runs.
 */
export function searchShortcuts<T extends Command>(
  commands: readonly T[],
  text: string,
  mac: boolean,
) {
  const byName = searchCommands(commands, text);
  const tokens = keyTokens(text, mac);
  if (tokens.length === 0) return byName;
  const byKeys = commands.filter(
    (command) =>
      !byName.includes(command) &&
      (command.keys ?? []).some((binding) => {
        const { key, mod, ctrl, alt, shift } = parseBinding(binding);
        const parts = [key, mod && "mod", ctrl && "ctrl", alt && "alt", shift && "shift"];
        return tokens.every((token) => parts.includes(token));
      }),
  );
  return [...byName, ...byKeys];
}
