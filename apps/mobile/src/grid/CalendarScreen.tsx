import { dayRange } from "@cal/domain";
import { router } from "expo-router";
import { CalendarDays, Plus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AgendaList } from "../agenda/AgendaList";
import { AgendaScreen } from "../agenda/AgendaScreen";
import { useCalendarAccess } from "../lib/account";
import { useApp } from "../lib/app";
import { useIsWide } from "../lib/device";
import { useColors } from "../lib/theme";
import { dayNumber, formatShortSpan, formatSpan } from "../lib/time";
import { jumpAgenda, showAgenda, showDays, useView } from "../lib/view";
import { DaysPager } from "./DaysPager";

// A choice in the header's switch: the agenda, or a number of days.
type Choice = "agenda" | number;

const choiceLabel = (choice: Choice) =>
  choice === "agenda" ? "Agenda" : choice === 7 ? "Week" : choice === 1 ? "Day" : `${choice} days`;

/*
 * The calendar: a title for the visible span, Today, the view switch (Agenda, then 1 or
 * 3 days on iPhone and up to a week on iPad), the agenda or the pager of days, and a
 * floating + for Quick Entry.
 */
export function CalendarScreen({
  views,
  inset = true,
}: {
  views: readonly Choice[];
  inset?: boolean;
}) {
  const { today } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const anchor = useView((state) => state.anchor);
  const count = useView((state) => state.count);
  const kind = useView((state) => state.kind);
  const focus = useView((state) => state.focus);
  const selected = useView((state) => state.selected);
  const wide = useIsWide();
  const { access, request } = useCalendarAccess();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const agenda = kind === "agenda";
  // Panes too narrow for the whole header (iPhone, the iPad's with its sidebar open) get a
  // shorter title and Today, and the narrowest put the switch on its own line.
  const room = size.width || (wide ? 600 : 390);
  const compact = room < 500;
  const stacked = room < 340;
  // The strip's month on iPhone; the list's current day without one.
  const first = agenda ? (wide ? selected : focus) : anchor;
  const days = dayRange(first, agenda ? 1 : count);
  const last = days[days.length - 1] ?? first;
  const atToday = agenda ? selected === today && first === today : days.includes(today);

  // Keeps the day in view: today when it's showing, else the agenda's day or the page's.
  const choose = (choice: Choice) => {
    const day = atToday ? today : agenda ? selected : anchor;
    if (choice !== "agenda") showDays(choice, day);
    else if (!agenda) showAgenda(day);
  };

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: inset ? insets.top : 0 }}>
      <View
        className={`min-h-14 flex-row items-center gap-2 pl-4 pr-3 ${
          stacked ? "flex-wrap py-2" : ""
        }`}
      >
        <Text
          className="flex-1 text-title-2 font-bold text-ink"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {!compact ? formatSpan(first, last) : formatShortSpan(first, last, today)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Today"
          onPress={() => (agenda ? jumpAgenda(today) : showDays(count, today))}
          hitSlop={4}
          className={`h-9 justify-center rounded-md active:bg-hover ${atToday ? "" : "bg-hover"} ${
            !compact ? "px-3" : "w-9 items-center"
          }`}
        >
          {!compact ? (
            <Text className={`text-body font-medium ${atToday ? "text-ink-3" : "text-ink"}`}>
              Today
            </Text>
          ) : (
            // The word doesn't fit beside three views: today's date on a small page.
            <View
              className="h-6 w-6 items-center justify-center rounded-md border-[1.5px]"
              style={{ borderColor: atToday ? colors["ink-3"] : colors.ink }}
            >
              <Text
                className={`text-caption font-semibold ${atToday ? "text-ink-3" : "text-ink"}`}
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {dayNumber(today)}
              </Text>
            </View>
          )}
        </Pressable>
        <View
          className={`h-9 flex-row rounded-md bg-hover p-0.5 ${stacked ? "w-full justify-between" : ""}`}
        >
          {views.map((each) => {
            const on = each === (agenda ? "agenda" : count);
            return (
              <Pressable
                key={each}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => choose(each)}
                hitSlop={{ top: 6, bottom: 6 }}
                className={`h-8 min-w-9 items-center justify-center rounded-[5px] px-2 ${
                  on ? "bg-canvas shadow-sm" : ""
                }`}
              >
                <Text
                  className={`text-body ${on ? "font-semibold text-ink" : "text-ink-2"}`}
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {choiceLabel(each)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {access !== "fullAccess" && (
        <View className="mx-4 mb-2 flex-row items-center gap-3 rounded-lg bg-hover px-3 py-2">
          <CalendarDays size={16} color={colors["ink-2"]} strokeWidth={1.5} absoluteStrokeWidth />
          <Text className="flex-1 text-small text-ink-2">Cal can't see your calendars yet.</Text>
          <Pressable accessibilityRole="button" onPress={() => void request()} hitSlop={8}>
            <Text className="text-small font-semibold text-accent">Allow access</Text>
          </Pressable>
        </View>
      )}

      <View
        className="flex-1"
        onLayout={({ nativeEvent: { layout } }) =>
          setSize({ width: layout.width, height: layout.height })
        }
      >
        {size.width > 0 &&
          (!agenda ? (
            <DaysPager width={size.width} height={size.height} />
          ) : wide ? (
            <AgendaList />
          ) : (
            <AgendaScreen key={size.width} width={size.width} />
          ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New to-do"
        onPress={() => router.push("/quick-entry")}
        className="absolute right-5 h-14 w-14 items-center justify-center rounded-full bg-accent-solid active:opacity-80"
        style={{
          bottom: 20 + (inset ? 0 : insets.bottom),
          shadowColor: colors["accent-solid"],
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Plus size={26} color={colors.white} strokeWidth={2.25} absoluteStrokeWidth />
      </Pressable>
    </View>
  );
}
