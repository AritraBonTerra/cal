import { UI_SCALE, useSettings } from "@cal/app-core";
import {
  ACCENTS,
  accentIds,
  type Mode,
  paletteOf,
  THEMES,
  type ThemeId,
  themesFor,
} from "@cal/theme";
import { Check } from "lucide-react";
import { useMode } from "../../lib/scheme";
import { Segmented, Slider } from "../ui";
import { Group, Row } from "./controls";

/*
 * Appearance: light, dark or the Mac's setting; the theme each mode draws; the accent;
 * and the interface size. All of it stays on this Mac.
 */
export function AppearanceSection() {
  const { device, setDevice } = useSettings();
  const mode = useMode();
  const accent = ACCENTS[device.accent];
  return (
    <>
      <Group title="Theme">
        <Row label="Mode" note="Auto follows the Mac">
          <Segmented
            value={device.theme}
            options={[
              { value: "system", label: "Auto" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            onChange={(value) => setDevice("theme", value)}
            label="Theme"
          />
        </Row>
        <ThemeRow
          mode="light"
          value={device.lightTheme}
          onChange={(id) => setDevice("lightTheme", id)}
        />
        <ThemeRow
          mode="dark"
          value={device.darkTheme}
          onChange={(id) => setDevice("darkTheme", id)}
        />
        <Row
          label="Accent"
          note={
            device.accent === "blue"
              ? "Cal's blue, with now in red"
              : `${accent.label} also colors now and today`
          }
        >
          <div role="radiogroup" aria-label="Accent" className="flex gap-1">
            {accentIds.map((id) => {
              const on = id === device.accent;
              const color = paletteOf(mode === "dark" ? device.darkTheme : device.lightTheme, id)[
                "accent-solid"
              ];
              return (
                // biome-ignore lint/a11y/useSemanticElements: a swatch, not a native radio.
                <button
                  type="button"
                  role="radio"
                  key={id}
                  aria-checked={on}
                  aria-label={ACCENTS[id].label}
                  title={ACCENTS[id].label}
                  onClick={() => setDevice("accent", id)}
                  className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-hover"
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full text-white"
                    style={{ background: color }}
                  >
                    {on && <Check size={12} strokeWidth={2.5} absoluteStrokeWidth />}
                  </span>
                </button>
              );
            })}
          </div>
        </Row>
      </Group>
      <Group title="Size">
        <Row label="Interface size" note="Text, panes and the calendar grow together">
          <Slider
            value={device.uiScale}
            min={UI_SCALE.min}
            max={UI_SCALE.max}
            step={UI_SCALE.step}
            onChange={(value) => setDevice("uiScale", value)}
            label="Interface size"
            format={(value) => `${value}%`}
            reset={100}
          />
        </Row>
      </Group>
    </>
  );
}

// The themes of one mode as small pictures of the window.
function ThemeRow({
  mode,
  value,
  onChange,
}: {
  mode: Mode;
  value: ThemeId;
  onChange: (id: ThemeId) => void;
}) {
  const label = mode === "light" ? "Light theme" : "Dark theme";
  return (
    <div className="border-t border-grid px-3 py-3">
      <div className="mb-2 text-body text-ink">{label}</div>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-6 gap-2">
        {themesFor(mode).map((id) => (
          // biome-ignore lint/a11y/useSemanticElements: a picture of the theme, not a native radio.
          <button
            type="button"
            role="radio"
            key={id}
            aria-checked={id === value}
            onClick={() => onChange(id)}
            className="group flex flex-col items-center gap-1.5"
            data-theme-choice={id}
          >
            <ThemePicture id={id} on={id === value} />
            <span className={`text-small ${id === value ? "font-medium text-ink" : "text-ink-2"}`}>
              {THEMES[id].label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// A theme as a tiny window: its sidebar, canvas, two lines of text and the accent.
function ThemePicture({ id, on }: { id: ThemeId; on: boolean }) {
  const { device } = useSettings();
  const colors = paletteOf(id, device.accent);
  return (
    <span
      aria-hidden
      className={`flex h-14 w-full overflow-hidden rounded-md ${
        on
          ? "shadow-[0_0_0_2px_var(--cal-accent)]"
          : "shadow-[0_0_0_1px_var(--cal-edge)] group-hover:shadow-[0_0_0_1px_var(--cal-edge-strong)]"
      }`}
      style={{ background: colors.canvas }}
    >
      <span className="w-1/3" style={{ background: colors.sidebar }} />
      <span className="flex flex-1 flex-col gap-1.5 p-2">
        <span className="h-1 w-4/5 rounded-full" style={{ background: colors.ink }} />
        <span className="h-1 w-3/5 rounded-full" style={{ background: colors["ink-3"] }} />
        <span className="mt-auto h-1.5 w-1.5 rounded-full" style={{ background: colors.now }} />
      </span>
    </span>
  );
}
