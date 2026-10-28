import { useActions } from "@cal/app-core";
import { isOpen, scheduledMinutes, type Task } from "@cal/domain";
import { router } from "expo-router";
import { CalendarClock, Check, Flag, Hourglass, Star, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useApp } from "../lib/app";
import { now } from "../lib/clock";
import { useColors } from "../lib/theme";
import { formatDuration, formatRelativeDay } from "../lib/time";
import { scheduleNext } from "../tasks/schedule";
import { WhenPicker } from "../tasks/WhenPicker";
import { Button, HeaderAction, SheetHeader } from "../ui/controls";

/*
 * A to-do's detail sheet: title and notes edit in place, When and deadline open their
 * pickers inline, estimate is a row of chips. Schedule places it in the next free
 * slot today (the touch stand-in for dragging onto the grid).
 */

const ESTIMATES = [15, 30, 45, 60, 90, 120, 180];

export function TaskSheet({ task, section }: { task: Task; section?: "when" | "deadline" }) {
  const { data, today } = useApp();
  const colors = useColors();
  const actions = useActions();
  const [open, setOpen] = useState<"when" | "deadline" | null>(section ?? null);
  const done = !isOpen(task);
  const project = data.projects.find((each) => each.uuid === task.project_uuid);
  const area = data.areas.find((each) => each.uuid === (task.area_uuid ?? project?.area_uuid));
  const scheduled = scheduledMinutes(task, data.blocks, now());

  const whenLabel =
    task.when === "date" && task.when_date
      ? formatRelativeDay(task.when_date, today)
      : task.when === "evening" && task.when_date
        ? `${formatRelativeDay(task.when_date, today)} evening`
        : task.when === "anytime"
          ? "Anytime"
          : task.when === "someday"
            ? "Someday"
            : "Inbox";

  const schedule = async () => {
    const placed = await scheduleNext(actions, task, data.blocks, now());
    if (placed) router.back();
    else Alert.alert("No room today", "Working hours are full. Try moving something first.");
  };

  const remove = () =>
    Alert.alert("Delete to-do?", "Its time blocks go too.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          router.back();
          void actions.deleteTask(task.uuid);
        },
      },
    ]);

  return (
    <View className="flex-1 bg-raised">
      <SheetHeader
        title="To-Do"
        right={<HeaderAction title="Done" bold onPress={() => router.back()} />}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-start gap-3">
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            onPress={() => void actions.setTaskDone(task.uuid, !done)}
            hitSlop={8}
            className={`mt-1 h-6 w-6 items-center justify-center rounded-xs ${
              done ? "bg-accent" : "border-[1.5px] border-edge-strong bg-canvas"
            }`}
          >
            {done && <Check size={16} color={colors.white} strokeWidth={3} absoluteStrokeWidth />}
          </Pressable>
          <TextInput
            defaultValue={task.title}
            placeholder="New To-Do"
            placeholderTextColor={colors["ink-3"]}
            onEndEditing={(event) => {
              const title = event.nativeEvent.text.trim();
              if (title && title !== task.title) void actions.updateTask(task.uuid, { title });
            }}
            className={`flex-1 py-1 text-title-2 font-semibold ${done ? "text-ink-3" : "text-ink"}`}
            multiline
          />
        </View>
        <TextInput
          defaultValue={task.notes ?? ""}
          placeholder="Notes"
          placeholderTextColor={colors["ink-3"]}
          onEndEditing={(event) => {
            const notes = event.nativeEvent.text.trim();
            if (notes !== (task.notes ?? ""))
              void actions.updateTask(task.uuid, { notes: notes || null });
          }}
          className="ml-9 mt-1 min-h-11 py-1 text-body text-ink"
          multiline
        />
        {(project || area) && (
          <Text className="ml-9 mt-1 text-small text-ink-3">{project?.title ?? area?.title}</Text>
        )}

        <View className="mt-5 overflow-hidden rounded-lg bg-canvas">
          <Field
            icon={<Star size={18} color={colors.warning} strokeWidth={1.5} absoluteStrokeWidth />}
            label="When"
            value={whenLabel}
            active={open === "when"}
            onPress={() => setOpen(open === "when" ? null : "when")}
          />
          {open === "when" && (
            <WhenPicker
              when={task.when}
              date={task.when_date}
              onChoose={(when, day) => {
                if (when !== "deadline") void actions.setWhen(task.uuid, when, day);
                setOpen(null);
              }}
            />
          )}
          <Field
            icon={<Flag size={18} color={colors.now} strokeWidth={1.5} absoluteStrokeWidth />}
            label="Deadline"
            value={task.deadline ? formatRelativeDay(task.deadline, today) : "None"}
            active={open === "deadline"}
            onPress={() => setOpen(open === "deadline" ? null : "deadline")}
          />
          {open === "deadline" && (
            <WhenPicker
              deadline
              date={task.deadline}
              onChoose={(_, day) => {
                void actions.updateTask(task.uuid, { deadline: day ?? null }, "Set Deadline");
                setOpen(null);
              }}
            />
          )}
          <View className="flex-row items-center gap-3 px-4 py-3">
            <Hourglass size={18} color={colors["ink-2"]} strokeWidth={1.5} absoluteStrokeWidth />
            <Text className="text-body text-ink">Estimate</Text>
            {scheduled > 0 && (
              <Text className="text-small text-ink-3" style={{ fontVariant: ["tabular-nums"] }}>
                {formatDuration(scheduled)} scheduled
              </Text>
            )}
          </View>
          <View className="flex-row flex-wrap gap-2 px-4 pb-3">
            {ESTIMATES.map((minutes) => {
              const active = task.estimate_min === minutes;
              return (
                <Pressable
                  key={minutes}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() =>
                    void actions.updateTask(
                      task.uuid,
                      { estimate_min: active ? null : minutes },
                      "Set Estimate",
                    )
                  }
                  className={`h-9 items-center justify-center rounded-full px-3.5 ${
                    active ? "bg-accent-soft" : "bg-hover"
                  }`}
                >
                  <Text
                    className={`text-body font-medium ${active ? "text-accent" : "text-ink"}`}
                    style={{ fontVariant: ["tabular-nums"] }}
                  >
                    {formatDuration(minutes)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="mt-5 gap-2">
          {!done && (
            <Button
              title="Schedule in next free slot"
              kind="primary"
              onPress={() => void schedule()}
              icon={
                <CalendarClock
                  size={18}
                  color={colors.white}
                  strokeWidth={1.5}
                  absoluteStrokeWidth
                />
              }
            />
          )}
          <Button
            title="Delete"
            kind="destructive"
            onPress={remove}
            icon={<Trash2 size={18} color={colors.now} strokeWidth={1.5} absoluteStrokeWidth />}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function Field({
  icon,
  label,
  value,
  active,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`h-12 flex-row items-center gap-3 px-4 ${active ? "bg-hover" : "active:bg-hover"}`}
    >
      {icon}
      <Text className="flex-1 text-body text-ink">{label}</Text>
      <Text className="text-body text-ink-2" style={{ fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
    </Pressable>
  );
}
