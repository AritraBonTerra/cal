import { useSettings } from "@cal/app-core";
import type { CalendarAccess } from "@cal/calendar-source";
import { ACCENTS, type AccentId } from "@cal/theme";
import Constants from "expo-constants";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { session } from "../data/cal";
import { syncLabel, useAccount, useCalendarAccess } from "../lib/account";
import { useColors } from "../lib/theme";
import { HeaderAction, Row, SectionLabel, SheetHeader } from "../ui/controls";
import { Appearance } from "./Appearance";

// 0 = Sunday … 6 = Saturday, the same three choices as the Mac's General settings.
const WEEK_STARTS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 6, label: "Saturday" },
];

const ACCESS_LABELS: Record<CalendarAccess, string> = {
  notDetermined: "Not set",
  fullAccess: "Allowed",
  writeOnly: "Add only",
  denied: "Off",
  restricted: "Restricted",
};

/*
 * Settings, as a page sheet: the account (sign in, sync status, sign out), light,
 * dark and themes, the week start and calendar permission, and the version. Only what this app honors is here.
 */
export function SettingsSheet() {
  const { auth, sync } = useAccount();
  const { access, request } = useCalendarAccess();
  const { account, device, setAccount } = useSettings();
  const signIn = () => router.push("/sign-in");

  const signOut = () =>
    Alert.alert("Sign out?", "Everything stays on this device. Syncing stops until you sign in.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => void session.signOut() },
    ]);

  return (
    <View className="flex-1 bg-sidebar">
      <SheetHeader
        title="Settings"
        right={<HeaderAction title="Done" bold onPress={() => router.back()} />}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}
      >
        <View className="w-full max-w-[560px] gap-6 self-center">
          <Section
            title="Account"
            note={
              auth.status === "signedOut"
                ? "Your to-dos, blocks and habits stay on this device until you sign in."
                : undefined
            }
          >
            {auth.status === "signedOut" ? (
              <ActionRow title="Sign in to sync" chevron last onPress={signIn} />
            ) : (
              <>
                <View className="min-h-14 flex-row items-center gap-3 border-b border-grid px-4 py-2">
                  <View
                    className={`h-2.5 w-2.5 rounded-full ${
                      sync.connected && !sync.needsSignIn ? "bg-success" : "bg-warning"
                    }`}
                  />
                  <View className="min-w-0 flex-1">
                    <Text className="text-body text-ink" numberOfLines={1}>
                      {auth.email}
                    </Text>
                    <Text
                      className="text-small text-ink-3"
                      style={{ fontVariant: ["tabular-nums"] }}
                    >
                      {sync.needsSignIn ? "Session expired" : syncLabel(sync)}
                    </Text>
                  </View>
                </View>
                {sync.needsSignIn && <ActionRow title="Sign in again" chevron onPress={signIn} />}
                <ActionRow title="Sign out" destructive last onPress={signOut} />
              </>
            )}
          </Section>

          <Section title="Appearance" note={accentNote(device.accent)}>
            <Appearance />
          </Section>

          <Section title="Calendar">
            <View className="gap-2.5 border-b border-grid px-4 py-3">
              <Text className="text-body text-ink">Start week on</Text>
              <View className="flex-row gap-2">
                {WEEK_STARTS.map(({ value, label }) => {
                  const selected = account.weekStart === value;
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => void setAccount("weekStart", value)}
                      className={`h-9 flex-1 items-center justify-center rounded-md ${
                        selected ? "bg-accent-soft" : "bg-hover active:bg-active"
                      }`}
                    >
                      <Text
                        className={`text-body font-medium ${selected ? "text-accent" : "text-ink"}`}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Row title="Calendar access" value={ACCESS_LABELS[access]} />
            {access === "notDetermined" ? (
              <ActionRow title="Allow access" last onPress={() => void request()} />
            ) : (
              <ActionRow
                title="Open iOS Settings"
                last
                onPress={() => void Linking.openSettings()}
              />
            )}
          </Section>

          <Section title="About">
            <Row title="Version" value={Constants.expoConfig?.version ?? "–"} last />
          </Section>
        </View>
      </ScrollView>
    </View>
  );
}

// What the accent colors besides buttons and links.
const accentNote = (accent: AccentId) =>
  accent === "blue"
    ? "Auto follows the device. Blue keeps now and today in red."
    : `Auto follows the device. ${ACCENTS[accent].label} also colors now and today.`;

// A labelled group of rows on one card, with an optional footnote under it.
function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View>
      <SectionLabel>{title}</SectionLabel>
      <View className="overflow-hidden rounded-lg bg-canvas">{children}</View>
      {note && <Text className="mt-2 px-1 text-small text-ink-3">{note}</Text>}
    </View>
  );
}

// A row that does something: accent text, or red for sign out; a chevron when it navigates.
function ActionRow({
  title,
  onPress,
  destructive,
  chevron,
  last,
}: {
  title: string;
  onPress: () => void;
  destructive?: boolean;
  chevron?: boolean;
  last?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="pl-4 active:bg-hover">
      <View
        className={`min-h-11 flex-row items-center gap-3 pr-3 ${last ? "" : "border-b border-grid"}`}
      >
        <Text className={`flex-1 text-body ${destructive ? "text-danger" : "text-accent"}`}>
          {title}
        </Text>
        {chevron && (
          <ChevronRight
            size={16}
            color={colors["edge-strong"]}
            strokeWidth={1.5}
            absoluteStrokeWidth
          />
        )}
      </View>
    </Pressable>
  );
}
