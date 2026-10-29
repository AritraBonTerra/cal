import { type AccountSettings, CalProvider, createCal, type DeviceSettings } from "@cal/app-core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ClockProvider, now } from "./lib/clock";
import "./styles.css";

// Actions stamp completions with the window's clock, which is fixed in fixture mode.
// Device settings live in localStorage, except in fixture mode, where every launch must
// start from the same defaults for screenshots.
const cal = createCal(window.cal.data, now, window.cal.config.fixture ? undefined : localStorage);
// Undo steps belong to the account that made them; see History.clear.
window.cal.auth.onChange(() => void cal.history.clear());

// Typed entries of a settings patch, so each key reaches the matching setter.
const entries = <T extends object>(patch: T) => Object.entries(patch) as [keyof T, T[keyof T]][];

// Fixture mode lets the screenshot and smoke scripts seed settings for a scene.
if (window.cal.config.fixture) {
  window.calTest = {
    seed: async ({ account = {}, device = {} }) => {
      for (const [key, value] of entries<Partial<AccountSettings>>(account)) {
        if (value !== undefined) await cal.settings.setAccount(key, value);
      }
      for (const [key, value] of entries<Partial<DeviceSettings>>(device)) {
        if (value !== undefined) cal.settings.setDevice(key, value);
      }
    },
  };
}

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");

createRoot(root).render(
  <StrictMode>
    <CalProvider cal={cal}>
      <ClockProvider>
        <App />
      </ClockProvider>
    </CalProvider>
  </StrictMode>,
);
