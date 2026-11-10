import { normalizeBinding } from "@cal/app-core";

/*
 * Menu bar shortcuts from command bindings. The menu shows the keys the user has set,
 * so its accelerators are worked out from the bindings rather than typed in.
 */

// Electron's names for keys whose binding name differs.
const KEYS: Record<string, string> = {
  arrowleft: "Left",
  arrowright: "Right",
  arrowup: "Up",
  arrowdown: "Down",
  enter: "Enter",
  escape: "Escape",
  backspace: "Backspace",
  delete: "Delete",
  tab: "Tab",
  space: "Space",
  plus: "Plus",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
};

const MODIFIERS: Record<string, string> = {
  mod: "CmdOrCtrl",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
};

/**
 * The Electron accelerator for `binding` ("mod+shift+k" → "CmdOrCtrl+Shift+K"), or
 * undefined when it has neither ⌘ nor ⌃: a bare key as a menu key equivalent would
 * swallow typing in text fields.
 */
export function accelerator(binding: string) {
  const parts = normalizeBinding(binding).split("+");
  const key = parts.pop() ?? "";
  if (!parts.includes("mod") && !parts.includes("ctrl")) return undefined;
  const name =
    KEYS[key] ?? (key.length === 1 || /^f\d{1,2}$/.test(key) ? key.toUpperCase() : undefined);
  if (!name) return undefined;
  return [...parts.map((part) => MODIFIERS[part] ?? part), name].join("+");
}

// The first of a command's keys the menu can show.
export const menuAccelerator = (keys: readonly string[]) =>
  keys.map(accelerator).find((each) => each !== undefined);
