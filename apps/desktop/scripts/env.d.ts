import type { AccountSettings, DeviceSettings } from "@cal/app-core";

// The fixture-mode hook the renderer exposes (see renderer/src/main.tsx).
declare global {
  // Fixture mode's handle on the capture panel in the main process (main/capture.ts).
  var calCapture: { show(): void; hide(): void } | undefined;
  interface Window {
    calTest?: {
      device(): DeviceSettings;
      seed(settings: {
        account?: Partial<AccountSettings>;
        device?: Partial<DeviceSettings>;
      }): Promise<void>;
    };
  }
}
