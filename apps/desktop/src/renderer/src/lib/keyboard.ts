import type { Cal } from "@cal/app-core";
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
      const handled = cal.commands.handle(
        {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
        },
        isMac,
      );
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cal]);

  // Menu items arrive as command ids. Undo inside a text field stays with the field.
  useEffect(
    () =>
      window.cal.onCommand((id) => {
        if ((id === "edit.undo" || id === "edit.redo") && inTextField(document.activeElement)) {
          document.execCommand(id === "edit.undo" ? "undo" : "redo");
          return;
        }
        cal.commands.run(id);
      }),
    [cal],
  );
}
