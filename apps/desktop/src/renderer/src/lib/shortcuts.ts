import {
  type BoundCommand,
  type CommandRegistry,
  type Keybindings,
  keyLabels,
  normalizeBinding,
  useCal,
} from "@cal/app-core";
import { useEffect, useSyncExternalStore } from "react";
import { isMac } from "./keyboard";

/*
 * The user's shortcuts, live. Keybindings (an account setting) are applied to the
 * command registry, the menu bar is told the keys in effect, and tooltips and hints
 * read a command's current binding instead of naming a key in their copy.
 */

/**
 * The binding in effect for command `id`: `prefer` when it's still one of its keys
 * (Week shows W rather than 0), else its first; null when it has none.
 */
export function useShortcut(id: string, prefer?: string) {
  const { commands } = useCal();
  useSyncExternalStore(
    (listener) => commands.subscribe(listener),
    () => commands.version,
  );
  return pick(commands.keysFor(id) ?? [], prefer);
}

function pick(keys: readonly string[], prefer?: string) {
  const preferred = prefer === undefined ? undefined : normalizeBinding(prefer);
  return keys.find((binding) => normalizeBinding(binding) === preferred) ?? keys[0] ?? null;
}

/**
 * What a command's default `binding` is now: the same key if it's still bound, else the
 * command's first key, null when it has none. For lists that name a command by its
 * default key, like the toolbar's view menu.
 */
export function rebound(commands: readonly BoundCommand[], binding: string, group: string) {
  const wanted = normalizeBinding(binding);
  const command = commands.find(
    (each) =>
      each.group === group && each.defaultKeys.some((key) => normalizeBinding(key) === wanted),
  );
  return command ? pick(command.keys, binding) : null;
}

// "⇧⌘E": a binding as one run of key symbols, for tooltips and notes.
export const shortcutText = (binding: string) => keyLabels(binding, isMac).join("");

// "Next (→)": a label with its shortcut, or the label alone when there is none.
export const withShortcut = (label: string, binding: string | null | undefined) =>
  binding ? `${label} (${shortcutText(binding)})` : label;

// Menu reports are batched to one per task: the registry changes in bursts.
let paused = false;
let sent: string | undefined;
let queued = false;

function reportMenuKeys(commands: CommandRegistry) {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    const keys = paused
      ? null
      : Object.fromEntries(commands.list(true).map((command) => [command.id, command.keys]));
    const json = JSON.stringify(keys);
    if (json === sent) return;
    sent = json;
    void window.cal.setMenuKeys(keys);
  });
}

/**
 * Takes the menu bar's command shortcuts away while a shortcut is being recorded, so
 * the keys pressed reach the recorder and run nothing, and gives them back after.
 */
export function pauseMenuKeys(commands: CommandRegistry, pause: boolean) {
  paused = pause;
  reportMenuKeys(commands);
}

// Applies the user's keybindings to the registry and keeps the menu bar's keys in step.
export function useKeybindings(keybindings: Keybindings) {
  const { commands } = useCal();
  useEffect(() => commands.setBindings(keybindings), [commands, keybindings]);
  useEffect(() => {
    reportMenuKeys(commands);
    return commands.subscribe(() => reportMenuKeys(commands));
  }, [commands]);
}
