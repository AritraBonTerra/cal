import { isDayKey } from "@cal/domain";
import { useLocalSearchParams } from "expo-router";
import { useApp } from "../src/lib/app";
import { NewBlockSheet } from "../src/sheets/NewBlockSheet";

// /new-block?day=2026-10-28&start=600&end=630 (minutes after midnight).
export default function NewBlockRoute() {
  const { today } = useApp();
  const params = useLocalSearchParams<{ day?: string; start?: string; end?: string }>();
  const day = params.day && isDayKey(params.day) ? params.day : today;
  const start = Math.min(minuteParam(params.start) ?? 9 * 60, 24 * 60 - 15);
  const end = minuteParam(params.end);
  return (
    <NewBlockSheet
      day={day}
      start={start}
      end={end !== undefined && end > start ? end : Math.min(start + 30, 24 * 60)}
    />
  );
}

// A minute of the day from a route param (0 is midnight), or undefined if it isn't one.
function minuteParam(value: string | undefined) {
  const minute = Number(value);
  return value !== undefined &&
    value !== "" &&
    Number.isInteger(minute) &&
    minute >= 0 &&
    minute <= 24 * 60
    ? minute
    : undefined;
}
