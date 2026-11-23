import { type AgendaDay, isEmptyDay, type TimedEntry, useActions } from "@cal/app-core";
import type { ExternalEvent } from "@cal/calendar-source";
import {
  type DayKey,
  habitDay,
  isOverdue,
  joinable,
  meetingOf,
  placeOf,
  type Task,
  toDayKey,
} from "@cal/domain";
import { blockColors, habitColors } from "@cal/theme";
import { router } from "expo-router";
import { Flag, Video } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { label } from "../grid/HabitStrip";
import { useApp } from "../lib/app";
import { graphite } from "../lib/calendars";
import { hueFor } from "../lib/data";
import { joinMeeting, openEvent } from "../lib/events";
import { useColors } from "../lib/theme";
import {
  formatDuration,
  formatMonthDay,
  formatRelativeDay,
  formatTime,
  formatWeekday,
} from "../lib/time";
import { Checkbox, Ring } from "../ui/controls";

const tnum = { fontVariant: ["tabular-nums" as const] };

/*
 * One day of the agenda, as on the Mac: its heading, today's habits, all-day events, the
 * to-dos without a block, then events and blocks in time order with the now line between
 * them.
 */
export function DaySection({ day, now }: { day: AgendaDay; now: Date }) {
  const { today } = useApp();
  const isToday = day.day === today;
  // The now line goes before the first thing still to start.
  const next = day.timed.findIndex((entry) => entry.start.getTime() > now.getTime());
  const line = next === -1 ? day.timed.length : next;
  return (
    <View className="w-full max-w-180 self-center pb-1">
      <View
        accessibilityRole="header"
        accessible
        className="flex-row items-baseline gap-2 px-4 pb-1 pt-5"
      >
        <Text className={`text-title-3 font-semibold ${isToday ? "text-now" : "text-ink"}`}>
          {dayTitle(day.day, today)}
        </Text>
        <Text className="text-small text-ink-3" style={tnum}>
          {daySubtitle(day.day, today)}
        </Text>
      </View>
      {day.habits.length > 0 && <Habits day={day} />}
      {day.allDay.map((event) => (
        <EventRow key={event.id} event={event} day={day.day} now={now} />
      ))}
      {day.tasks.map((task) => (
        <TaskLine key={task.uuid} task={task} day={day.day} />
      ))}
      {day.due.map((task) => (
        <TaskLine key={task.uuid} task={task} day={day.day} />
      ))}
      {day.timed.map((entry, index) => (
        <View key={entry.key}>
          {isToday && index === line && <NowLine now={now} />}
          {entry.kind === "event" ? (
            <EventRow event={entry.event} entry={entry} day={day.day} now={now} />
          ) : (
            <BlockRow entry={entry} day={day.day} now={now} />
          )}
        </View>
      ))}
      {isToday && line === day.timed.length && <NowLine now={now} />}
      {isEmptyDay(day) && <Text className="px-4 py-1 text-body text-ink-3">Nothing planned</Text>}
    </View>
  );
}

// "Today", "Tomorrow", "Yesterday", else the weekday.
function dayTitle(day: DayKey, today: DayKey) {
  const relative = formatRelativeDay(day, today);
  return ["Today", "Tomorrow", "Yesterday"].includes(relative)
    ? relative
    : formatWeekday(day, true);
}

// The date, with the weekday when the title doesn't say it.
function daySubtitle(day: DayKey, today: DayKey) {
  const titled = dayTitle(day, today) === formatWeekday(day, true);
  return titled ? formatMonthDay(day) : `${formatWeekday(day)}, ${formatMonthDay(day)}`;
}

function NowLine({ now }: { now: Date }) {
  return (
    <View
      accessible
      accessibilityLabel={`Now, ${formatTime(now)}`}
      className="h-6 flex-row items-center pl-4"
    >
      <Text className="w-18 text-small font-semibold text-now" style={tnum}>
        {formatTime(now)}
      </Text>
      <View className="-ml-px h-2 w-2 rounded-full bg-now" />
      <View className="h-px flex-1 bg-now" />
    </View>
  );
}

interface RowProps {
  // What VoiceOver reads for the row.
  label: string;
  // Start over end, or a word ("all-day"); nothing for a to-do.
  time?: ReactNode;
  mark: ReactNode;
  title: string;
  // Done or declined.
  struck?: boolean;
  // One line under the title.
  detail?: ReactNode;
  past?: boolean;
  onPress: () => void;
  trailing?: ReactNode;
  // The row's own control (its checkbox or Join), for VoiceOver, which reads the row as one.
  action?: { label: string; run: () => void };
}

// One line of the agenda: the time column, a mark in the item's color, then its text.
function Row({
  label,
  time,
  mark,
  title,
  struck,
  detail,
  past,
  onPress,
  trailing,
  action,
}: RowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={action && [{ name: "action", label: action.label }]}
      onAccessibilityAction={action?.run}
      onPress={onPress}
      className="min-h-11 flex-row items-start px-4 py-2 active:bg-hover"
    >
      <View className="w-18">{time}</View>
      <View className="h-5 w-7 justify-center">{mark}</View>
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={2}
          className={`text-body ${past ? "text-ink-3" : "text-ink"} ${struck ? "line-through" : ""}`}
        >
          {title}
        </Text>
        {detail}
      </View>
      {trailing}
    </Pressable>
  );
}

function Detail({ children }: { children: string }) {
  return (
    <Text numberOfLines={1} className="text-small text-ink-3" style={tnum}>
      {children}
    </Text>
  );
}

// A time on `day`; a time on another day is named by that day.
const timeOn = (at: Date, day: DayKey, today: DayKey) => {
  const on = toDayKey(at);
  return on === day ? formatTime(at) : formatRelativeDay(on, today);
};

// A start over an end.
function Times({ entry, day, past }: { entry: TimedEntry; day: DayKey; past: boolean }) {
  const { today } = useApp();
  return (
    <>
      <Text
        numberOfLines={1}
        className={`text-small leading-5 ${past ? "text-ink-3" : "text-ink"}`}
        style={tnum}
      >
        {timeOn(entry.start, day, today)}
      </Text>
      <Text numberOfLines={1} className="text-caption text-ink-3" style={tnum}>
        {timeOn(entry.end, day, today)}
      </Text>
    </>
  );
}

function EventRow({
  event,
  entry,
  day,
  now,
}: {
  event: ExternalEvent;
  // The timed entry; absent for an all-day event.
  entry?: TimedEntry;
  day: DayKey;
  now: Date;
}) {
  const { palette, mode, calendars, today } = useApp();
  const theme = useColors();
  const past = Date.parse(event.end) <= now.getTime();
  const colors = palette.get(event.calendarId) ?? graphite(mode);
  const meeting = meetingOf(event);
  const place = placeOf(event);
  const join = meeting && joinable(event, now) ? () => joinMeeting(meeting) : undefined;
  const when = entry
    ? `${timeOn(entry.start, day, today)} to ${timeOn(entry.end, day, today)}`
    : "all day";
  return (
    <Row
      label={[event.title, when, place].filter(Boolean).join(", ")}
      time={
        entry ? (
          <Times entry={entry} day={day} past={past} />
        ) : (
          <Text className="text-small leading-5 text-ink-3">all-day</Text>
        )
      }
      mark={
        <View
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: past ? colors.pastTime : colors.bar }}
        />
      }
      title={event.title}
      detail={place && <Detail>{place}</Detail>}
      past={past}
      onPress={() => openEvent(event, calendars)}
      action={join && { label: `Join ${meeting?.service}`, run: join }}
      trailing={
        join ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Join ${meeting?.service}`}
            onPress={join}
            hitSlop={6}
            className="ml-3 h-8 flex-row items-center gap-1.5 rounded-full border border-edge px-3 active:bg-active"
          >
            <Video size={14} color={theme.ink} strokeWidth={1.5} absoluteStrokeWidth />
            <Text className="text-small font-medium text-ink">Join</Text>
          </Pressable>
        ) : meeting ? (
          <View className="ml-3 h-5 justify-center">
            <Video size={14} color={theme["ink-3"]} strokeWidth={1.5} absoluteStrokeWidth />
          </View>
        ) : null
      }
    />
  );
}

function BlockRow({
  entry,
  day,
  now,
}: {
  entry: Extract<TimedEntry, { kind: "block" }>;
  day: DayKey;
  now: Date;
}) {
  const { mode, today } = useApp();
  const theme = useColors();
  const actions = useActions();
  const { block, task, project } = entry;
  const done = block.done_at !== undefined;
  const past = entry.end.getTime() <= now.getTime();
  const stripe = project ? blockColors(hueFor(project), mode).stripe : theme["edge-strong"];
  const minutes = Math.round((entry.end.getTime() - entry.start.getTime()) / 60_000);
  const title = task?.title ?? "Block";
  const toggle = (checked: boolean) => void actions.setBlockDone(block, checked);
  return (
    <Row
      label={[
        title,
        done && "done",
        `${timeOn(entry.start, day, today)} to ${timeOn(entry.end, day, today)}`,
        project?.title,
      ]
        .filter(Boolean)
        .join(", ")}
      time={<Times entry={entry} day={day} past={past} />}
      mark={
        <Checkbox checked={done} size={18} label={done ? "Reopen" : "Complete"} onChange={toggle} />
      }
      title={title}
      struck={done}
      detail={
        <View className="flex-row items-center gap-1.5">
          <View className="h-2.5 w-[3px] rounded-full" style={{ backgroundColor: stripe }} />
          <Detail>{[project?.title, formatDuration(minutes)].filter(Boolean).join(" · ")}</Detail>
        </View>
      }
      past={past || done}
      onPress={() => router.push({ pathname: "/block/[id]", params: { id: block.uuid } })}
      action={{ label: done ? "Reopen" : "Complete", run: () => toggle(!done) }}
    />
  );
}

// A to-do without a time on its day, or one due that day.
function TaskLine({ task, day }: { task: Task; day: DayKey }) {
  const { data, today } = useApp();
  const theme = useColors();
  const actions = useActions();
  const project = data.projects.find((each) => each.uuid === task.project_uuid);
  const overdue = isOverdue(task, today);
  const due =
    task.deadline !== undefined && task.deadline <= day
      ? overdue
        ? "Overdue"
        : task.deadline === today
          ? "Due today"
          : "Due"
      : undefined;
  const title = task.title || "New To-Do";
  const complete = () => void actions.setTaskDone(task.uuid, true);
  return (
    <Row
      label={[title, due, project?.title].filter(Boolean).join(", ")}
      mark={<Checkbox checked={false} size={18} label="Complete" onChange={complete} />}
      title={title}
      detail={
        (due || project) && (
          <View className="flex-row items-center gap-1">
            {due && (
              <>
                <Flag
                  size={12}
                  color={overdue ? theme.danger : theme["ink-3"]}
                  strokeWidth={1.5}
                  absoluteStrokeWidth
                />
                <Text className={`text-small ${overdue ? "text-danger" : "text-ink-3"}`}>
                  {due}
                </Text>
              </>
            )}
            {project && <Detail>{due ? `· ${project.title}` : project.title}</Detail>}
          </View>
        )
      }
      onPress={() => router.push({ pathname: "/task/[id]", params: { id: task.uuid } })}
      action={{ label: "Complete", run: complete }}
    />
  );
}

// Today's habits as chips: a tap logs one, a long press takes one back.
function Habits({ day }: { day: AgendaDay }) {
  const { data, mode, today } = useApp();
  const actions = useActions();
  return (
    <View className="flex-row flex-wrap gap-x-1.5 gap-y-3 px-4 py-2">
      {day.habits.map((habit) => {
        const { value, done, fraction, segments, next, less } = habitDay(
          habit,
          data.entries,
          day.day,
        );
        const colors = habitColors(hueFor(habit), mode);
        return (
          <Pressable
            key={habit.uuid}
            accessibilityRole="button"
            accessibilityState={{ checked: done }}
            accessibilityLabel={habit.title}
            accessibilityHint="Logs one. Long press takes one back."
            hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => void actions.logHabit(habit.uuid, day.day, next)}
            onLongPress={() => void actions.logHabit(habit.uuid, day.day, less)}
            className={`h-8 flex-row items-center gap-1.5 rounded-full pr-3 pl-2 ${
              done ? "" : "bg-hover"
            }`}
            style={done ? { backgroundColor: colors.fill } : undefined}
          >
            <Ring
              fraction={fraction}
              status={done ? "done" : "open"}
              color={colors.ring}
              size={16}
              segments={segments}
            />
            <Text
              className={`text-small font-medium ${done ? "" : "text-ink-2"}`}
              style={[done && { color: colors.label }, tnum]}
            >
              {label(habit, day.day, value, done, data.entries, today)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
