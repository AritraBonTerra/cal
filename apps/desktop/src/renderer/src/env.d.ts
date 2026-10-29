import type { AccountSettings, DeviceSettings } from "@cal/app-core";
import type { CalBridge } from "../../shared/api";

declare global {
  interface Window {
    cal: CalBridge;
    // Fixture-mode hook for the screenshot and smoke scripts: seeds settings for a scene.
    calTest?: {
      seed(settings: {
        account?: Partial<AccountSettings>;
        device?: Partial<DeviceSettings>;
      }): Promise<void>;
    };
  }
}
