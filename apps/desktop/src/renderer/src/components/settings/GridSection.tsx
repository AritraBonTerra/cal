import { useSettings } from "@cal/app-core";
import { formatHour } from "../../lib/time";
import { ZOOM_STEPS } from "../grid/model";
import { Keycaps, Segmented, Select, Switch } from "../ui";
import { Group, Row } from "./controls";

// The zoom levels by name, smallest first: fit, then one per step of ZOOM_STEPS.
const ZOOM_LABELS = ["Fit day", "S", "M", "L", "XL"];
const ZOOMS = ZOOM_STEPS.map((height, index) => ({
  value: String(height),
  label: ZOOM_LABELS[index] ?? `${height}`,
}));

const HOURS = Array.from({ length: 25 }, (_, hour) => ({
  value: hour * 60,
  label: hour === 24 ? "Midnight" : formatHour(hour),
}));

const LENGTHS = [15, 30, 45, 60, 90].map((minutes) => ({
  value: String(minutes),
  label: minutes < 60 ? `${minutes}m` : minutes === 60 ? "1h" : "1h30",
}));

// Grid: zoom (the height of an hour), half-hour lines, working hours and the workload
// row, the length of a click-made block.
export function GridSection() {
  const { account, device, setAccount, setDevice } = useSettings();
  const { start, end } = account.workingHours;
  // A pinch or ⌥-scroll leaves a height between the steps; the control shows the nearest.
  const nearest = ZOOM_STEPS.reduce<number>(
    (best, step) =>
      Math.abs(step - device.hourHeight) <= Math.abs(best - device.hourHeight) ? step : best,
    0,
  );
  return (
    <>
      <Group title="Hours">
        <Row label="Zoom" note="How tall an hour is. Fit day shows all 24 hours at once">
          <Segmented
            value={String(nearest)}
            options={ZOOMS}
            onChange={(value) => setDevice("hourHeight", Number(value))}
            label="Zoom"
          />
        </Row>
        <Row label="Zoom keys" note="Pinch or ⌥-scroll on the grid for anything in between">
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
        <Row label="Workload bar" note="Meetings and planned work against working hours">
          <Switch
            checked={device.workloadBar}
            onChange={(value) => setDevice("workloadBar", value)}
            label="Workload bar"
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
