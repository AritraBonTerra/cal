import { UI_SCALE, useSettings } from "@cal/app-core";
import { useEffect, useState } from "react";
import { CAPTURE_COMMAND } from "../../../../shared/api";
import { shortcutText, useShortcut } from "../../lib/shortcuts";
import { Segmented, Select, Slider, Switch } from "../ui";
import { Group, Row } from "./controls";

const WEEK_STARTS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 6, label: "Saturday" },
];

// Whether macOS opens Cal at login, read from and written to Login Items.
function useOpenAtLogin() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    void window.cal.openAtLogin.get().then((value) => active && setOpen(value));
    return () => {
      active = false;
    };
  }, []);
  const change = (value: boolean) => {
    setOpen(value);
    void window.cal.openAtLogin.set(value).then(setOpen);
  };
  return [open, change] as const;
}

// General: what the calendar shows, navigation, time format, theme, maps and startup.
export function GeneralSection() {
  const { account, device, setAccount, setDevice } = useSettings();
  const weekendsKey = useShortcut("view.weekends");
  const todayKey = useShortcut("nav.today");
  const todayLeftKey = useShortcut("nav.todayLeft");
  const captureKey = useShortcut(CAPTURE_COMMAND);
  const [openAtLogin, setOpenAtLogin] = useOpenAtLogin();
  // "Press T to", or "Today command" once T is unbound.
  const todayLabel = todayKey ? `Press ${shortcutText(todayKey)} to` : "Today command";
  return (
    <>
      <Group title="Calendar view">
        <Row
          label="Show weekends"
          note={weekendsKey ? `${shortcutText(weekendsKey)} toggles this too` : undefined}
        >
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
        <Row
          label={todayLabel}
          note={todayLeftKey ? `${shortcutText(todayLeftKey)} always puts today first` : undefined}
        >
          <Segmented
            value={account.todayKey}
            options={[
              { value: "go", label: "Go to today" },
              { value: "left-align", label: "Left-align today" },
            ]}
            onChange={(value) => void setAccount("todayKey", value)}
            label={todayLabel}
          />
        </Row>
      </Group>
      <Group title="Appearance">
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
      <Group title="Startup">
        <Row
          label="Open at login"
          note={
            captureKey
              ? `So ${shortcutText(captureKey)} adds to Cal from any app as soon as you log in`
              : "Cal starts when you log in to the Mac"
          }
        >
          <Switch checked={openAtLogin} onChange={setOpenAtLogin} label="Open at login" />
        </Row>
      </Group>
    </>
  );
}
