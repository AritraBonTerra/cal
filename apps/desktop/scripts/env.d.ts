import type { AccountSettings, DeviceSettings } from "@cal/app-core";

// The fixture-mode hook the renderer exposes (see renderer/src/main.tsx).
declare global {
  interface Window {
    calTest?: {
      seed(settings: {
        account?: Partial<AccountSettings>;
        device?: Partial<DeviceSettings>;
      }): Promise<void>;
    };
  }
}
