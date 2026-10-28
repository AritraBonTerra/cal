import { Check } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useColors } from "../lib/theme";

// Small shared controls, each one a token recipe from research/07 §7, drawn for touch.

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  // Box size in pt; the hit area is always at least 44pt.
  size?: 14 | 18 | 22;
  label: string;
}

// Things-style round-square checkbox: 1.5pt outline, accent fill with a white check.
export function Checkbox({ checked, onChange, size = 22, label }: CheckboxProps) {
  const colors = useColors();
  const slop = Math.max(0, (44 - size) / 2);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      hitSlop={slop}
      onPress={() => onChange(!checked)}
      className={`items-center justify-center rounded-xs ${checked ? "bg-accent" : "bg-canvas"}`}
      style={[
        { width: size, height: size },
        !checked && { borderWidth: 1.5, borderColor: colors["edge-strong"] },
      ]}
    >
      {checked && (
        <Check size={size - 6} color={colors.white} strokeWidth={3} absoluteStrokeWidth />
      )}
    </Pressable>
  );
}

interface RingProps {
  // 0–1 of the ring drawn; 1 shows a filled disc with a check.
  fraction: number;
  color: string;
  // Covered days get a dashed ring, future and missed days a quiet one.
  status?: "open" | "done" | "covered" | "off" | "missed" | "future";
  size?: number;
}

// A progress ring for habits (12pt in the strip, larger in the Habits list).
export function Ring({ fraction, color, status = "open", size = 14 }: RingProps) {
  const colors = useColors();
  const stroke = size >= 24 ? 2.5 : 1.5;
  const r = size / 2 - stroke / 2 - 0.25;
  const c = 2 * Math.PI * r;
  if (fraction >= 1) {
    return (
      <View
        className="items-center justify-center rounded-full"
        style={{ width: size, height: size, backgroundColor: color }}
      >
        <Check size={size * 0.6} color={colors.white} strokeWidth={2.5} absoluteStrokeWidth />
      </View>
    );
  }
  const quiet = status === "covered" || status === "future" || status === "missed";
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={quiet ? colors["edge-strong"] : color}
        strokeWidth={stroke}
        strokeDasharray={status === "covered" ? "2 2" : undefined}
      />
      {fraction > 0 && (
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${c * fraction} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </Svg>
  );
}

interface ButtonProps {
  title: string;
  onPress: () => void;
  // Filled accent, outlined, or plain text; `destructive` turns plain red.
  kind?: "primary" | "secondary" | "plain" | "destructive";
  disabled?: boolean;
  icon?: ReactNode;
}

// A 44pt button in one of three weights.
export function Button({ title, onPress, kind = "secondary", disabled, icon }: ButtonProps) {
  const fill =
    kind === "primary"
      ? "bg-accent-solid"
      : kind === "secondary"
        ? "bg-hover active:bg-active"
        : "active:bg-hover";
  const text =
    kind === "primary"
      ? "text-white"
      : kind === "destructive"
        ? "text-now"
        : kind === "plain"
          ? "text-accent"
          : "text-ink";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      className={`h-11 flex-row items-center justify-center gap-2 rounded-lg px-4 ${fill} ${
        disabled ? "opacity-50" : ""
      }`}
    >
      {icon}
      <Text className={`text-body font-semibold ${text}`}>{title}</Text>
    </Pressable>
  );
}

// A sheet's top band: a grabber-sized gap, the title, and optional leading/trailing actions.
export function SheetHeader({
  title,
  left,
  right,
}: {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View className="h-14 flex-row items-center px-4">
      <View className="w-20 flex-row items-center">{left}</View>
      <Text className="flex-1 text-center text-title-3 font-semibold text-ink" numberOfLines={1}>
        {title}
      </Text>
      <View className="w-20 flex-row items-center justify-end">{right}</View>
    </View>
  );
}

// A text action for sheet headers ("Cancel", "Done"), with a 44pt hit area.
export function HeaderAction({
  title,
  onPress,
  bold,
  disabled,
}: {
  title: string;
  onPress: () => void;
  bold?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      className={`h-11 justify-center ${disabled ? "opacity-40" : ""}`}
    >
      <Text className={`text-title-3 text-accent ${bold ? "font-semibold" : ""}`}>{title}</Text>
    </Pressable>
  );
}

// A grouped-list section label: sentence case, secondary color, on the 4pt grid.
export function SectionLabel({ children }: { children: string }) {
  return <Text className="mb-2 px-1 text-small font-medium text-ink-2">{children}</Text>;
}

// A grouped-list row: 44pt, hairline separator, optional trailing content.
export function Row({
  icon,
  title,
  value,
  onPress,
  last,
  children,
}: {
  icon?: ReactNode;
  title: string;
  value?: string;
  onPress?: () => void;
  last?: boolean;
  children?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      disabled={!onPress}
      className="min-h-11 flex-row items-center gap-3 pl-4 active:bg-hover"
    >
      {icon}
      <View
        className={`min-h-11 flex-1 flex-row items-center gap-3 py-2 pr-4 ${
          last ? "" : "border-b border-grid"
        }`}
      >
        <Text className="flex-1 text-body text-ink" numberOfLines={1}>
          {title}
        </Text>
        {value !== undefined && (
          <Text className="text-body text-ink-3" style={{ fontVariant: ["tabular-nums"] }}>
            {value}
          </Text>
        )}
        {children}
      </View>
    </Pressable>
  );
}
