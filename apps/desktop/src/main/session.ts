import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { SessionStorage } from "@cal/sync";
import { safeStorage } from "electron";

// The session's tokens in a file encrypted with the macOS Keychain via safeStorage.
export const encryptedFile = (file: string): SessionStorage => ({
  read: () =>
    existsSync(file) && safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(readFileSync(file))
      : undefined,
  write: (value) => {
    if (!safeStorage.isEncryptionAvailable()) return;
    writeFileSync(file, safeStorage.encryptString(value), { mode: 0o600 });
  },
  clear: () => rmSync(file, { force: true }),
});
