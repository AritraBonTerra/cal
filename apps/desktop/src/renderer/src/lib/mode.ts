import type { Mode } from "@cal/theme";

type Matches = { readonly matches: boolean };

// The part of a MediaQueryList the store uses.
type DarkQuery = Matches & {
  addEventListener(type: "change", listener: (event: Matches) => void): void;
};

const modeOf = ({ matches }: Matches): Mode => (matches ? "dark" : "light");

// The mode as of the query's last "change" event, as a store. Nothing may read
// `query.matches` after this: Chromium drops the event for a change that `matches`
// was read after, so a render just after a switch would leave the rest of the page behind.
export function modeStore(query: DarkQuery) {
  let mode = modeOf(query);
  const listeners = new Set<() => void>();
  query.addEventListener("change", (event) => {
    mode = modeOf(event);
    for (const listener of listeners) listener();
  });
  return {
    current: () => mode,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
