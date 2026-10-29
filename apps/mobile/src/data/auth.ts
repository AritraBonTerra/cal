import { expoClient } from "@better-auth/expo/client";
import type { AuthAdapter } from "@cal/sync";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/client";
import * as SecureStore from "expo-secure-store";

/*
 * Google sign-in on iPhone and iPad (research/11 §4): Better Auth's Expo client opens
 * Google in an in-app browser sheet and comes back through the `cal://` scheme (`exp://`
 * in Expo Go). Its session cookie lives in the Keychain; Convex JWTs are minted from it.
 */
export function createMobileAuth(siteUrl: string) {
  const client = createAuthClient({
    baseURL: siteUrl,
    plugins: [
      expoClient({ scheme: "cal", storagePrefix: "cal", storage: SecureStore }),
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
    // Runs the whole Google flow in a browser sheet; resolves once it's done or dismissed.
    signInWithGoogle: async () => {
      const { error } = await client.signIn.social({ provider: "google", callbackURL: "/" });
      if (error) throw new Error(error.message ?? "Couldn't sign in with Google.");
    },
  };
}
