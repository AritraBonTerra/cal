import { useLocalSearchParams } from "expo-router";
import { EventSheet } from "../../src/sheets/EventSheet";

// Device events aren't stored, so the chip passes what the sheet shows as params.
export default function EventRoute() {
  const params = useLocalSearchParams<{
    title?: string;
    start?: string;
    end?: string;
    allDay?: string;
    location?: string;
    notes?: string;
    calendar?: string;
    color?: string;
  }>();
  return (
    <EventSheet
      title={params.title ?? ""}
      start={params.start ?? new Date().toISOString()}
      end={params.end ?? new Date().toISOString()}
      allDay={params.allDay === "1"}
      location={params.location || undefined}
      notes={params.notes || undefined}
      calendar={params.calendar ?? ""}
      color={params.color || "#888888"}
    />
  );
}
