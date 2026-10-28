import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});

// Resolves the signed-in user or throws NOT_AUTHENTICATED.
export async function requireUserId(ctx: Pick<MutationCtx, "auth">) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new ConvexError({ code: "NOT_AUTHENTICATED" });
  return userId;
}
