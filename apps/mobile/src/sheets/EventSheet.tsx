import { meetingOf, placeOf, toDayKey } from "@cal/domain";
import { chipColorsFromHex } from "@cal/theme";
import { router } from "expo-router";
import { MapPin, Video } from "lucide-react-native";
import { Text, View } from "react-native";
import { useApp } from "../lib/app";
import { joinMeeting } from "../lib/events";
import { useColors } from "../lib/theme";
import { formatRange, formatRelativeDay, formatWeekday } from "../lib/time";
import { Button, HeaderAction, SheetHeader } from "../ui/controls";

interface EventSheetProps {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  notes?: string;
  url?: string;
  calendar: string;
  color: string;
}

// A device event, read-only on the phone for now: when, where, which calendar, notes,
// and a button to join its call.
export function EventSheet({
  title,
  start,
  end,
  allDay,
  location,
  notes,
  url,
  calendar,
  color,
}: EventSheetProps) {
  const { today, mode } = useApp();
  const colors = useColors();
  // Links may carry the color without "#", since "#" would start a URL fragment.
  const chip = chipColorsFromHex(color.startsWith("#") ? color : `#${color}`, mode, colors.canvas);
  const from = new Date(start);
  const to = new Date(end);
  const day = toDayKey(from);
  const meeting = meetingOf({ url, location, notes });
  const place = placeOf({ url, location, notes });
  const PlaceIcon = place && place === meeting?.service ? Video : MapPin;
  const when = allDay
    ? `${formatWeekday(day, true)}, ${formatRelativeDay(day, today)} · All day`
    : `${formatRelativeDay(day, today)} · ${formatRange(from, to)}`;

  return (
    <View className="flex-1 bg-raised">
      <SheetHeader
        title="Event"
        right={<HeaderAction title="Done" bold onPress={() => router.back()} />}
      />
      <View className="px-4 pb-8">
        <View className="flex-row items-start gap-3">
          <View className="mt-2 h-5 w-1 rounded-full" style={{ backgroundColor: chip.bar }} />
          <View className="flex-1">
            <Text className="text-title-2 font-semibold text-ink">{title}</Text>
            <Text className="mt-1 text-body text-ink-2" style={{ fontVariant: ["tabular-nums"] }}>
              {when}
            </Text>
          </View>
        </View>
        {meeting && (
          <View className="mt-5">
            <Button
              title={`Join ${meeting.service}`}
              kind="primary"
              icon={<Video size={18} color={colors.white} strokeWidth={1.5} absoluteStrokeWidth />}
              onPress={() => joinMeeting(meeting)}
            />
          </View>
        )}
        <View className="mt-5 overflow-hidden rounded-lg bg-canvas">
          <View className="h-12 flex-row items-center gap-3 px-4">
            <View className="h-3 w-3 rounded-full" style={{ backgroundColor: chip.bar }} />
            <Text className="flex-1 text-body text-ink">Calendar</Text>
            <Text className="text-body text-ink-2">{calendar}</Text>
          </View>
          {place ? (
            <View className="min-h-12 flex-row items-center gap-3 border-t border-grid px-4 py-3">
              <PlaceIcon size={16} color={colors["ink-2"]} strokeWidth={1.5} absoluteStrokeWidth />
              <Text className="flex-1 text-body text-ink">{place}</Text>
            </View>
          ) : null}
        </View>
        {notes ? <Text className="mt-5 px-1 text-body text-ink-2">{notes}</Text> : null}
      </View>
    </View>
  );
}
