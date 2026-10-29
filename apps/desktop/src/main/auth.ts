import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { electronClient } from "@better-auth/electron/client";
import type { AuthAdapter } from "@cal/sync";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/client";

/*
 * Google sign-in on the Mac (research/11 §3). The Better Auth client lives only in the
 * main process: "Continue with Google" opens the system browser; after Google, the
 * deployment's `/` page sends the browser back to `dev.aritra.cal://auth/callback`
 * (or shows a code to paste in development builds, where the link can't open Cal), and
 * `complete()` exchanges that one-time token for a session cookie kept on disk.
 */

export const SCHEME = "dev.aritra.cal";

// The auth client's key-value storage, as a JSON file. The plugin encrypts the values it
// writes with safeStorage itself; the file just keeps them across launches.
function jsonFile(file: string) {
  const values: Record<string, unknown> = existsSync(file)
    ? (() => {
        try {
          const json: unknown = JSON.parse(readFileSync(file, "utf8"));
          return typeof json === "object" && json !== null ? { ...json } : {};
        } catch {
          return {};
        }
      })()
    : {};
  return {
    getItem: (name: string) => values[name] ?? null,
    setItem: (name: string, value: unknown) => {
      values[name] = value;
      writeFileSync(file, JSON.stringify(values), { mode: 0o600 });
    },
  };
}

export function createDesktopAuth(siteUrl: string, file: string) {
  const client = createAuthClient({
    baseURL: siteUrl,
    plugins: [
      electronClient({
        signInURL: siteUrl,
        protocol: { scheme: SCHEME },
        storage: jsonFile(file),
        userImageProxy: { enabled: false },
      }),
      convexClient(),
    ],
  });

  const adapter: AuthAdapter = {
    token: async () => {
      try {
        const { data, error } = await client.convex.token({ fetchOptions: { throw: false } });
        if (data?.token) return data.token;
        return error?.status === 401 ? "signedOut" : null;
      } catch {
        return null;
      }
    },
    signOut: async () => {
      await client.signOut();
    },
  };

  return {
    adapter,
    // Opens Google sign-in in the browser.
    start: () => client.requestAuth({ provider: "google" }),
    /**
     * Finishes sign-in from the callback link (`dev.aritra.cal://auth/callback#token=…`)
     * or the code shown on the handoff page.
     */
    complete: async (linkOrCode: string) => {
      const token = linkOrCode.includes("#token=")
        ? (linkOrCode.split("#token=")[1] ?? "")
        : linkOrCode.trim();
      if (!token) throw new Error("That code is empty.");
      await client.authenticate({ token });
    },
  };
}
