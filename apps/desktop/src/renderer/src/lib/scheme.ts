import type { Mode } from "@cal/theme";
import { useSyncExternalStore } from "react";

const query = window.matchMedia("(prefers-color-scheme: dark)");

const subscribe = (listener: () => void) => {
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};

// "light" or "dark", following the system. Chip colors are derived per mode.
export const useMode = (): Mode =>
  useSyncExternalStore(subscribe, () => (query.matches ? "dark" : "light"));

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

export const reducedMotion = () => motionQuery.matches;
