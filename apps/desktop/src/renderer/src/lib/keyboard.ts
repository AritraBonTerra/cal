import type { Cal, KeyInput } from "@cal/app-core";
import { useEffect } from "react";

export const isMac = window.cal.platform === "darwin";

// Whether a key event came from somewhere that takes typing.
export function inTextField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

// Keys whose ⇧ variant is another character on most layouts (⇧⌘. arrives as ">"):
// with ⌘ and ⇧ held, bindings name the unshifted key.
const UNSHIFTED: Record<string, string> = {
  Period: ".",
  Comma: ",",
  Digit0: "0",
  Digit1: "1",
  Digit2: "2",
  Digit3: "3",
  Digit4: "4",
  Digit5: "5",
  Digit6: "6",
  Digit7: "7",
  Digit8: "8",
  Digit9: "9",
};

/**
 * A key event as the command registry sees it. Bindings name keys, not the characters
 * modifiers produce: ⌥ with a letter or digit types a symbol ("†" for ⌥T), and ⇧⌘. arrives
 * as ">", so both are turned back into the key. The dispatcher and the shortcut recorder
 * both go through this, so a recorded binding always matches its own key press.
 */
export function keyInput(event: KeyboardEvent): KeyInput {
  const mod = isMac ? event.metaKey : event.ctrlKey;
  const typed =
    event.altKey && /^(Key[A-Z]|Digit\d)$/.test(event.code) ? event.code.slice(-1) : undefined;
  const unshifted = mod && event.shiftKey ? UNSHIFTED[event.code] : undefined;
  return {
    key: typed ?? unshifted ?? event.key,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
  };
}

/**
 * Routes window key presses to the command registry. Inside a text field only ⌘
 * shortcuts run, so typing "t" never jumps to today. Overlays and inputs that handle a
 * key themselves call preventDefault first and are left alone.
 */
export function useKeyboard(cal: Cal) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const typing = inTextField(event.target);
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (typing && !mod) return;
      // The field's own undo and redo, and clipboard, stay native.
      if (typing && /^[zxcva]$/i.test(event.key)) return;
      const handled = cal.commands.handle(keyInput(event), isMac);
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cal]);

  // Menu items arrive as command ids. Undo inside a text field stays with the field.
  useEffect(
    () =>
      window.cal.onCommand((id) => {
        if (!editText(id)) cal.commands.run(id);
      }),
    [cal],
  );
}

/**
 * Runs the menu's Undo or Redo (`id`) on the focused text field, which keeps its own
 * typing history. Returns whether it did; the menu's other commands are the window's.
 */
export function editText(id: string) {
  if ((id !== "edit.undo" && id !== "edit.redo") || !inTextField(document.activeElement)) {
    return false;
  }
  document.execCommand(id === "edit.undo" ? "undo" : "redo");
  return true;
}
