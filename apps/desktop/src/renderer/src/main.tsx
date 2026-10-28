import { CalProvider, createCal } from "@cal/app-core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const cal = createCal(window.cal.data);

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <CalProvider cal={cal}>
      <App />
    </CalProvider>
  </StrictMode>,
);
