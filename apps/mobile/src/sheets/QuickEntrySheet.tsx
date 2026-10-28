import { useActions } from "@cal/app-core";
import { parseQuickEntry, type TokenKind } from "@cal/nlp";
import { router } from "expo-router";
import { CalendarDays, Flag, Folder, Hourglass, Moon, Zap } from "lucide-react-native";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useApp } from "../lib/app";
import { now } from "../lib/clock";
import { type ListId, newTaskIn } from "../lib/lists";
import { useColors } from "../lib/theme";
import { formatDuration, formatRelativeDay, formatTime } from "../lib/time";
import { HeaderAction, SheetHeader } from "../ui/controls";

/*
 * Quick Entry: one line of natural language. Recognized parts light up as you type
 * (the input's children are styled spans) and are listed as chips underneath; Add
 * creates the to-do, and a block when a time was given.
 */

const TOKEN_ICONS: Record<TokenKind, typeof Flag> = {
  when: CalendarDays,
  evening: Moon,
  deadline: Flag,
  estimate: Hourglass,
  priority: Zap,
  project: Folder,
};

export function QuickEntrySheet({
  initialText = "",
  list = "inbox",
}: {
  initialText?: string;
  // Where the new to-do goes unless the text says otherwise.
  list?: ListId;
}) {
  const { data, today } = useApp();
  const colors = useColors();
  const actions = useActions();
  const [text, setText] = useState(initialText);
  const entry = parseQuickEntry(text, now(), data.projects);
  const project = data.projects.find((each) => each.uuid === entry.project_uuid);

  const chips: { kind: TokenKind; label: string }[] = [];
  if (entry.when === "evening") chips.push({ kind: "evening", label: "This Evening" });
  else if (entry.when === "date" && entry.when_date) {
    chips.push({
      kind: "when",
      label: entry.start_at
        ? `${formatRelativeDay(entry.when_date, today)} ${formatTime(entry.start_at)}`
        : formatRelativeDay(entry.when_date, today),
    });
  } else if (entry.when)
    chips.push({ kind: "when", label: entry.when === "someday" ? "Someday" : "Anytime" });
  if (entry.deadline)
    chips.push({ kind: "deadline", label: `Due ${formatRelativeDay(entry.deadline, today)}` });
  if (entry.estimate_min)
    chips.push({ kind: "estimate", label: formatDuration(entry.estimate_min) });
  if (entry.priority) chips.push({ kind: "priority", label: `P${entry.priority}` });
  if (project) chips.push({ kind: "project", label: project.title });

  const submit = async () => {
    if (!entry.title) return;
    router.back();
    const { tokens: _tokens, title, start_at, ...fields } = entry;
    // The list's defaults (Today, a project…), overridden by anything typed; a typed
    // When replaces the list's day too.
    const defaults = newTaskIn(list, today);
    const uuid = await actions.createTask({
      ...defaults,
      ...(fields.when && { when_date: undefined }),
      title,
      ...fields,
    });
    if (start_at) {
      const end = new Date(start_at.getTime() + (entry.estimate_min ?? 30) * 60_000);
      await actions.scheduleTask(uuid, start_at, end);
    }
  };

  // The text as styled runs: recognized tokens get the accent tint.
  const pieces: { text: string; kind?: TokenKind }[] = [];
  let cursor = 0;
  for (const token of entry.tokens) {
    if (token.start > cursor) pieces.push({ text: text.slice(cursor, token.start) });
    pieces.push({ text: text.slice(token.start, token.end), kind: token.kind });
    cursor = token.end;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor) });

  return (
    <View className="flex-1 bg-raised">
      <SheetHeader
        title="New To-Do"
        left={<HeaderAction title="Cancel" onPress={() => router.back()} />}
        right={
          <HeaderAction title="Add" bold disabled={!entry.title} onPress={() => void submit()} />
        }
      />
      <View className="px-4">
        <TextInput
          autoFocus
          onChangeText={setText}
          onSubmitEditing={() => void submit()}
          returnKeyType="done"
          blurOnSubmit={false}
          autoCorrect={false}
          placeholder="Call the movers tomorrow 3pm ~30m !fri /launch"
          placeholderTextColor={colors["ink-3"]}
          className="min-h-12 py-2 text-title-3 text-ink"
          multiline
        >
          <Text className="text-title-3 text-ink">
            {pieces.map((piece, index) => (
              <Text
                // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional text.
                key={index}
                className={piece.kind ? "bg-accent-soft text-accent" : ""}
              >
                {piece.text}
              </Text>
            ))}
          </Text>
        </TextInput>
        <View className="min-h-14 flex-row flex-wrap items-center gap-2 py-3">
          {chips.length === 0 ? (
            <Text className="text-small text-ink-3">
              Try <Text className="text-ink-2">tomorrow</Text>,{" "}
              <Text className="text-ink-2">tonight</Text>, <Text className="text-ink-2">!fri</Text>,{" "}
              <Text className="text-ink-2">~45m</Text>, <Text className="text-ink-2">p1</Text>,{" "}
              <Text className="text-ink-2">/project</Text>
            </Text>
          ) : (
            chips.map(({ kind, label }) => {
              const Icon = TOKEN_ICONS[kind];
              return (
                <View
                  key={kind}
                  className="h-8 flex-row items-center gap-1.5 rounded-full bg-hover pl-2.5 pr-3"
                >
                  <Icon size={14} color={colors["ink-2"]} strokeWidth={1.5} absoluteStrokeWidth />
                  <Text
                    className="text-small font-medium text-ink-2"
                    style={{ fontVariant: ["tabular-nums"] }}
                  >
                    {label}
                  </Text>
                </View>
              );
            })
          )}
        </View>
        {entry.title ? (
          <Text className="pb-4 text-small text-ink-3" numberOfLines={1}>
            “{entry.title}”
          </Text>
        ) : null}
      </View>
    </View>
  );
}
