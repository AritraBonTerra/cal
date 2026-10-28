import { CalProvider, createActions, createCal } from "@cal/app-core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ClockProvider, now } from "./lib/clock";
import "./styles.css";

const cal = createCal(window.cal.data);
// Actions stamp completions with the window's clock, which is fixed in fixture mode.
cal.actions = createActions(cal.history, now);
// Undo steps belong to the account that made them; see History.clear.
window.cal.auth.onChange(() => void cal.history.clear());

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
