import { useSettings } from "@cal/app-core";
import { Segmented, Select, Switch } from "../ui";
import { Group, Row } from "./controls";

const WEEK_STARTS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 6, label: "Saturday" },
];

// General: what the calendar shows, navigation, time format, theme and maps.
export function GeneralSection() {
  const { account, device, setAccount, setDevice } = useSettings();
  return (
    <>
      <Group title="Calendar view">
        <Row label="Show weekends" note="⇧⌘E toggles this too">
          <Switch
            checked={account.showWeekends}
            onChange={(value) => void setAccount("showWeekends", value)}
            label="Show weekends"
          />
        </Row>
        <Row label="Show declined events" note="Invitations you said no to">
          <Switch
            checked={account.showDeclined}
            onChange={(value) => void setAccount("showDeclined", value)}
            label="Show declined events"
          />
        </Row>
        <Row label="Show week numbers">
          <Switch
            checked={account.weekNumbers}
            onChange={(value) => void setAccount("weekNumbers", value)}
            label="Show week numbers"
          />
        </Row>
        <Row label="Start week on">
          <Select
            value={account.weekStart}
            options={WEEK_STARTS}
            onChange={(value) => void setAccount("weekStart", value)}
            label="Start week on"
            width={120}
          />
        </Row>
      </Group>
      <Group title="Navigation">
        <Row label="Press T to" note="⌥T always puts today first">
          <Segmented
            value={account.todayKey}
            options={[
              { value: "go", label: "Go to today" },
              { value: "left-align", label: "Left-align today" },
            ]}
            onChange={(value) => void setAccount("todayKey", value)}
            label="Press T to"
          />
        </Row>
      </Group>
      <Group title="Appearance">
        <Row label="Time format">
          <Segmented
            value={account.timeFormat}
            options={[
              { value: "system", label: "System" },
              { value: "12h", label: "12-hour" },
              { value: "24h", label: "24-hour" },
            ]}
            onChange={(value) => void setAccount("timeFormat", value)}
            label="Time format"
          />
        </Row>
        <Row label="Theme" note="Auto follows the Mac">
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
        <Row label="Open locations in">
          <Segmented
            value={account.maps}
            options={[
              { value: "apple", label: "Apple Maps" },
              { value: "google", label: "Google Maps" },
            ]}
            onChange={(value) => void setAccount("maps", value)}
            label="Open locations in"
          />
        </Row>
      </Group>
    </>
  );
}
