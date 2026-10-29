import { useActions } from "@cal/app-core";
import { parseQuickEntry, pieces, type TokenKind } from "@cal/nlp";
import { router } from "expo-router";
import {
  Bell,
  CalendarDays,
  Clock,
  Flag,
  Folder,
  Hash,
  Hourglass,
  Moon,
  Repeat,
  Zap,
} from "lucide-react-native";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useApp } from "../lib/app";
import { now } from "../lib/clock";
import { type ListId, newTaskIn } from "../lib/lists";
import { useColors } from "../lib/theme";
import { HeaderAction, SheetHeader } from "../ui/controls";

/*
 * Quick Entry: one line of natural language. Recognized parts light up as you type
 * (the input's children are styled spans) and are listed as chips underneath; Add
 * creates the to-do, and a block when a time was given.
 */

const TOKEN_ICONS: Partial<Record<TokenKind, typeof Flag>> = {
  when: CalendarDays,
  date_range: CalendarDays,
  time: Clock,
  time_range: Clock,
  evening: Moon,
  later: CalendarDays,
  deadline: Flag,
  estimate: Hourglass,
  duration: Hourglass,
  priority: Zap,
  list: Folder,
  tag: Hash,
  recurrence: Repeat,
  reminder: Bell,
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
  const entry = parseQuickEntry(text, {
    now: now(),
    surface: "list",
    kind: "task",
    projects: data.projects,
  });
  const chips = entry.tokens.filter((token) => token.applied && token.kind !== "mode");

  const submit = async () => {
    if (!entry.title) return;
    router.back();
    // The list's defaults (Today, a project…), overridden by anything typed.
    await actions.createFromEntry(entry, newTaskIn(list, today));
  };

  // The text as styled runs: recognized tokens get the accent tint. A token nested in
  // another (a zone inside its time) is skipped, so no text shows twice.
  const runs = pieces(
    text,
    entry.tokens.filter((each) => each.applied),
  );

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
            {runs.map((piece, index) => (
              <Text
                // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional text.
                key={index}
                className={piece.token ? "bg-accent-soft text-accent" : ""}
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
            chips.map(({ kind, label, start }) => {
              const Icon = TOKEN_ICONS[kind] ?? CalendarDays;
              return (
                <View
                  key={start}
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
