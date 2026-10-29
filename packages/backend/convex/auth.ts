import { electron } from "@better-auth/electron";
import { expo } from "@better-auth/expo";
import { type AuthFunctions, createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { ConvexError } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import authConfig from "./auth.config";

/*
 * Sign-in is Better Auth with Google, running inside Convex (research/11). Devices keep
 * a long-lived session and trade it for 15-minute Convex JWTs; the JWT's subject is the
 * Better Auth user id, which `users.authId` maps to Cal's own user id (`owner_id`).
 */

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      /*
       * A new Better Auth user gets a Cal user: an existing one with the same verified
       * email (accounts from before Google sign-in keep their data), or a new row. Runs
       * in Better Auth's transaction, so a failure here cancels the sign-up.
       */
      onCreate: async (ctx, authUser) => {
        const existing = authUser.emailVerified
          ? await ctx.db
              .query("users")
              .withIndex("email", (q) => q.eq("email", authUser.email))
              .first()
          : null;
        if (existing && !existing.authId) {
          await ctx.db.patch(existing._id, { authId: authUser._id });
          return;
        }
        await ctx.db.insert("users", {
          email: authUser.email,
          name: authUser.name,
          authId: authUser._id,
        });
      },
    },
  },
});

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

// Origins the apps call from: the Mac's custom scheme, the iOS app's, and Expo Go in dev.
const devOrigins = process.env.CAL_EXPO_GO === "1" ? ["exp://", "exp://**"] : [];

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: process.env.CONVEX_SITE_URL,
    database: authComponent.adapter(ctx),
    trustedOrigins: ["dev.aritra.cal:/", "cal://", ...devOrigins],
    // Rolling: each use extends it, so a device offline for under 60 days resumes silently.
    session: { expiresIn: 60 * 60 * 24 * 60, updateAge: 60 * 60 * 24 },
    // Email sign-in exists for scripts and tests (packages/sync/scripts/live.ts); the
    // apps offer Google. Unverified emails never link to an existing account.
    emailAndPassword: { enabled: true },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        prompt: "select_account",
      },
    },
    plugins: [electron(), expo(), convex({ authConfig })],
  });

// Resolves the signed-in user's Cal id, or throws NOT_AUTHENTICATED.
export async function requireUserId(ctx: Pick<QueryCtx, "auth" | "db">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ code: "NOT_AUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("authId", (q) => q.eq("authId", identity.subject))
    .unique();
  if (!user) throw new ConvexError({ code: "NOT_AUTHENTICATED" });
  return user._id;
}
