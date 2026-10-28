import { useSyncExternalStore } from "react";

/**
 * A tiny external store for window-level UI state (the view, selection, open overlay).
 * State is replaced, never mutated, so selectors can return pieces by identity.
 */
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<T> | ((current: T) => Partial<T>)) {
      const next = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type Store<T extends object> = ReturnType<typeof createStore<T>>;

// Re-renders when `select(state)` changes by identity, so select primitives or stored refs.
export function useStore<T extends object, R>(store: Store<T>, select: (state: T) => R) {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
