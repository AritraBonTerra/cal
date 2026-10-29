import { query } from "./_generated/server";
import { requireUserId } from "./auth";

// The signed-in user's Cal id and email; devices call it once after signing in, since
// the JWT's subject is the Better Auth id rather than the id their data is filed under.
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    return { userId, email: user?.email ?? "" };
  },
});
