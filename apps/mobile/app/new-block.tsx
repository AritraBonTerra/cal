import { isDayKey } from "@cal/domain";
import { useLocalSearchParams } from "expo-router";
import { useApp } from "../src/lib/app";
import { NewBlockSheet } from "../src/sheets/NewBlockSheet";

// /new-block?day=2026-10-28&start=600&end=630 (minutes after midnight).
export default function NewBlockRoute() {
  const { today } = useApp();
  const params = useLocalSearchParams<{ day?: string; start?: string; end?: string }>();
  const day = params.day && isDayKey(params.day) ? params.day : today;
  const start = Number(params.start) || 9 * 60;
  const end = Number(params.end) || start + 30;
  return <NewBlockSheet day={day} start={start} end={end} />;
}
