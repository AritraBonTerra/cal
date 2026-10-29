import { useSettings } from "@cal/app-core";
import { formatHour } from "../../lib/time";
import { Keycaps, Segmented, Select, Switch } from "../ui";
import { Group, Row } from "./controls";

const HOUR_HEIGHTS = [
  { value: 0, label: "Fit day" },
  { value: 32, label: "32 px" },
  { value: 40, label: "40 px" },
  { value: 48, label: "48 px" },
  { value: 56, label: "56 px" },
  { value: 64, label: "64 px" },
  { value: 80, label: "80 px" },
  { value: 96, label: "96 px" },
];

const HOURS = Array.from({ length: 25 }, (_, hour) => ({
  value: hour * 60,
  label: hour === 24 ? "Midnight" : formatHour(hour),
}));

const LENGTHS = [15, 30, 45, 60, 90].map((minutes) => ({
  value: String(minutes),
  label: minutes < 60 ? `${minutes}m` : minutes === 60 ? "1h" : "1h30",
}));

// Grid: hour height, working hours, the length of a click-made block, half-hour lines.
export function GridSection() {
  const { account, device, setAccount, setDevice } = useSettings();
  const { start, end } = account.workingHours;
  // A pinch or ⌥-scroll leaves a height between the steps; the menu shows the nearest.
  const nearest = HOUR_HEIGHTS.reduce((best, option) =>
    Math.abs(option.value - device.hourHeight) < Math.abs(best.value - device.hourHeight)
      ? option
      : best,
  );
  return (
    <>
      <Group title="Hours">
        <Row label="Hour height" note="Never shorter than what fits the window">
          <Select
            value={nearest.value}
            options={HOUR_HEIGHTS}
            onChange={(value) => setDevice("hourHeight", value)}
            label="Hour height"
            width={112}
          />
        </Row>
        <Row label="Zoom" note="Pinch or ⌥-scroll on the grid zooms around the pointer">
          <span className="flex items-center gap-1 text-small text-ink-2">
            <Keycaps binding="mod+shift+." /> in
            <Keycaps binding="mod+shift+," className="ml-2" /> out
            <Keycaps binding="mod+shift+0" className="ml-2" /> reset
          </span>
        </Row>
        <Row label="Half-hour lines">
          <Switch
            checked={device.halfHourLines}
            onChange={(value) => setDevice("halfHourLines", value)}
            label="Half-hour lines"
          />
        </Row>
      </Group>
      <Group title="Working hours">
        <Row label="Working hours" note="Hours outside are shaded">
          <Select
            value={start}
            options={HOURS.filter((hour) => hour.value < end)}
            onChange={(value) => void setAccount("workingHours", { start: value, end })}
            label="Working hours start"
            width={104}
          />
          <span className="text-small text-ink-3">to</span>
          <Select
            value={end}
            options={HOURS.filter((hour) => hour.value > start)}
            onChange={(value) => void setAccount("workingHours", { start, end: value })}
            label="Working hours end"
            width={104}
          />
        </Row>
      </Group>
      <Group title="New events">
        <Row label="Default event length" note="For a click on the grid and new events">
          <Segmented
            value={String(account.eventMinutes)}
            options={LENGTHS}
            onChange={(value) => void setAccount("eventMinutes", Number(value))}
            label="Default event length"
          />
        </Row>
      </Group>
    </>
  );
}
