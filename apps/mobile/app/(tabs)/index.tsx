import { isDayKey } from "@cal/domain";
import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { CalendarScreen } from "../../src/grid/CalendarScreen";
import { Workspace } from "../../src/ipad/Workspace";
import { useIsWide } from "../../src/lib/device";
import { showDays, view } from "../../src/lib/view";

// The calendar. `?day=YYYY-MM-DD&days=3` opens a given page, for deep links and screenshots.
export default function CalendarRoute() {
  const wide = useIsWide();
  const { day, days } = useLocalSearchParams<{ day?: string; days?: string }>();
  useEffect(() => {
    const count = Number(days);
    if (day && isDayKey(day) && count > 0) showDays(count, day);
    else if (count > 0) showDays(count, view.get().anchor);
  }, [day, days]);
  if (wide) return <Workspace initial={{ kind: "list", list: "today" }} />;
  return <CalendarScreen counts={[1, 3]} />;
}
