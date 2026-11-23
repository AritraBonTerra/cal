import { isDayKey } from "@cal/domain";
import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { CalendarScreen } from "../../src/grid/CalendarScreen";
import { Workspace } from "../../src/ipad/Workspace";
import { useToday } from "../../src/lib/clock";
import { useIsWide } from "../../src/lib/device";
import { jumpAgenda, setMonth, showAgenda, showDays, view } from "../../src/lib/view";

// The calendar, for deep links and screenshots: `?day=YYYY-MM-DD&days=3` opens that page,
// `?view=agenda&day=YYYY-MM-DD&month=1` the agenda there with its month pulled down.
export default function CalendarRoute() {
  const wide = useIsWide();
  const today = useToday();
  const { day, days, month, ...params } = useLocalSearchParams<{
    day?: string;
    days?: string;
    view?: string;
    month?: string;
  }>();
  useEffect(() => {
    const count = Number(days);
    const { kind, anchor, selected } = view.get();
    const on = day && isDayKey(day) ? day : undefined;
    if (count > 0) showDays(count, on ?? (kind === "agenda" ? selected : anchor));
    else if (params.view === "agenda") {
      if (on) jumpAgenda(on);
      else if (kind !== "agenda") showAgenda(today);
      if (month) setMonth(month === "1");
    }
  }, [day, days, params.view, month, today]);
  if (wide) return <Workspace initial={{ kind: "list", list: "today" }} />;
  return <CalendarScreen views={["agenda", 1, 3]} />;
}
