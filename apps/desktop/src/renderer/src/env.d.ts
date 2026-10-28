import type { CalBridge } from "../../shared/api";

declare global {
  interface Window {
    cal: CalBridge;
  }
}
