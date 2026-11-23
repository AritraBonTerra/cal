import { useLocalSearchParams } from "expo-router";
import { unpackEvent } from "../../src/lib/events";
import { EventSheet } from "../../src/sheets/EventSheet";

// Device events aren't stored, so `openEvent` packs what the sheet shows into the route.
// Plain params work too, for deep links and screenshots.
export default function EventRoute() {
  const params = useLocalSearchParams<{
    event?: string;
    title?: string;
    start?: string;
    end?: string;
    allDay?: string;
    location?: string;
    notes?: string;
    url?: string;
    calendar?: string;
    color?: string;
  }>();
  if (params.event) return <EventSheet {...unpackEvent(params.event)} />;
  return (
    <EventSheet
      title={params.title ?? ""}
      start={params.start ?? new Date().toISOString()}
      end={params.end ?? new Date().toISOString()}
      allDay={params.allDay === "1"}
      location={params.location || undefined}
      notes={params.notes || undefined}
      url={params.url || undefined}
      calendar={params.calendar ?? ""}
      color={params.color || "#888888"}
    />
  );
}
