import { expect, test } from "bun:test";
import { modeStore } from "../src/renderer/src/lib/mode";

// A dark-mode query as Chromium runs it: a switch raises "change" at the next frame, and
// reading `matches` before then uses the event up.
function chromiumQuery() {
  let dark = false;
  let seen = false;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  return {
    query: {
      get matches() {
        seen = dark;
        return seen;
      },
      addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
        listeners.add(listener);
      },
    },
    flip: (to: boolean) => {
      dark = to;
    },
    frame: () => {
      if (seen === dark) return;
      seen = dark;
      for (const listener of listeners) listener({ matches: dark });
    },
  };
}

test("a render between a switch and the next frame doesn't cost the others the change", () => {
  const { query, flip, frame } = chromiumQuery();
  const store = modeStore(query);
  const heard: string[] = [];
  const unsubscribe = store.subscribe(() => heard.push(store.current()));

  flip(true);
  store.current();
  frame();
  flip(false);
  store.current();
  frame();
  expect(heard).toEqual(["dark", "light"]);

  unsubscribe();
  flip(true);
  frame();
  expect(heard).toEqual(["dark", "light"]);
  expect(store.current()).toBe("dark");
});
