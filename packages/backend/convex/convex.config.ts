import betterAuth from "@convex-dev/better-auth/convex.config";
import { defineApp } from "convex/server";

// Better Auth runs as a Convex component with its own tables (users, sessions, keys).
const app = defineApp();
app.use(betterAuth);

export default app;
