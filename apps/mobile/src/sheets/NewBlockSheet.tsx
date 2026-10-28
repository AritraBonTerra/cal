import { useActions } from "@cal/app-core";
import type { DayKey } from "@cal/domain";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { instant } from "../grid/model";
import { useApp } from "../lib/app";
import { useColors } from "../lib/theme";
import { formatDuration, formatRange, formatRelativeDay } from "../lib/time";
import { HeaderAction, SheetHeader } from "../ui/controls";

const LENGTHS = [15, 30, 45, 60, 90, 120];

// After a long-press on empty grid: name the to-do, pick a length, and it's placed.
export function NewBlockSheet({
  day,
  start,
  end: initialEnd,
}: {
  day: DayKey;
  start: number;
  end: number;
}) {
  const { today } = useApp();
  const colors = useColors();
  const actions = useActions();
  const [title, setTitle] = useState("");
  const [length, setLength] = useState(initialEnd - start);
  const end = Math.min(24 * 60, start + length);

  const add = async () => {
    const text = title.trim();
    if (!text) return;
    router.back();
    const uuid = await actions.createTask({
      title: text,
      position: -1,
      when: "date",
      when_date: day,
      estimate_min: length,
    });
    await actions.scheduleTask(uuid, instant(day, start), instant(day, end));
  };

  return (
    <View className="flex-1 bg-raised">
      <SheetHeader
        title="New Block"
        left={<HeaderAction title="Cancel" onPress={() => router.back()} />}
        right={
          <HeaderAction title="Add" bold disabled={!title.trim()} onPress={() => void add()} />
        }
      />
      <View className="px-4">
        <TextInput
          autoFocus
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={() => void add()}
          returnKeyType="done"
          placeholder="What will you work on?"
          placeholderTextColor={colors["ink-3"]}
          className="h-12 text-title-2 font-semibold text-ink"
        />
        <Text className="mt-1 text-body text-ink-2" style={{ fontVariant: ["tabular-nums"] }}>
          {formatRelativeDay(day, today)} · {formatRange(instant(day, start), instant(day, end))}
        </Text>
        <View className="flex-row flex-wrap gap-2 py-4">
          {LENGTHS.map((minutes) => (
            <Pressable
              key={minutes}
              accessibilityRole="button"
              accessibilityState={{ selected: minutes === length }}
              onPress={() => setLength(minutes)}
              className={`h-9 items-center justify-center rounded-full px-3.5 ${
                minutes === length ? "bg-accent-soft" : "bg-hover"
              }`}
            >
              <Text
                className={`text-body font-medium ${minutes === length ? "text-accent" : "text-ink"}`}
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {formatDuration(minutes)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}
