import { describe, expect, test } from "bun:test";
import { accelerator, menuAccelerator } from "../src/main/accelerator";

// The menu bar's accelerators come from command bindings; bare keys never become one.
describe("menu accelerators", () => {
  test("bindings with ⌘ or ⌃ convert to Electron's names", () => {
    expect(accelerator("mod+n")).toBe("CmdOrCtrl+N");
    expect(accelerator("shift+mod+k")).toBe("CmdOrCtrl+Shift+K");
    expect(accelerator("mod+alt+n")).toBe("CmdOrCtrl+Alt+N");
    expect(accelerator("mod+shift+.")).toBe("CmdOrCtrl+Shift+.");
    expect(accelerator("mod+\\")).toBe("CmdOrCtrl+\\");
    expect(accelerator("ctrl+arrowleft")).toBe("Ctrl+Left");
    expect(accelerator("mod+backspace")).toBe("CmdOrCtrl+Backspace");
    expect(accelerator("mod+plus")).toBe("CmdOrCtrl+Plus");
    expect(accelerator("mod+space")).toBe("CmdOrCtrl+Space");
  });

  test("bare keys and ⇧ or ⌥ alone get none", () => {
    expect(accelerator("t")).toBeUndefined();
    expect(accelerator("shift+arrowup")).toBeUndefined();
    expect(accelerator("alt+t")).toBeUndefined();
    expect(accelerator("?")).toBeUndefined();
  });

  test("a menu item shows the first binding that can be an accelerator", () => {
    expect(menuAccelerator([" ", "mod+."])).toBe("CmdOrCtrl+.");
    expect(menuAccelerator(["enter", "e"])).toBeUndefined();
    expect(menuAccelerator([])).toBeUndefined();
  });
});
