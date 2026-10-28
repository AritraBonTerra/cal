import { type DayKey, toDayKey } from "@cal/domain";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { now } from "../data/cal";

/*
 * The app's clock. In fixture mode it starts at the configured instant and runs from
 * there, so screenshots always show the same "now"; otherwise it's real time.
 */

export { now };

const ClockContext = createContext<Date>(now());

// Re-renders its subtree once a minute, on the minute, so the now line and "today" move.
export function ClockProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState(now);
  useEffect(() => {
    const timer = setTimeout(() => setCurrent(now()), 60_000 - (current.getTime() % 60_000) + 50);
    return () => clearTimeout(timer);
  }, [current]);
  return <ClockContext.Provider value={current}>{children}</ClockContext.Provider>;
}

export const useNow = () => useContext(ClockContext);

export const useToday = (): DayKey => toDayKey(useNow());
