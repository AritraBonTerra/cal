import type { AuthConfig } from "convex/server";

// Convex Auth issues JWTs from this deployment's site URL. PowerSync verifies the
// same tokens via `${CONVEX_SITE_URL}/.well-known/jwks.json` with audience "convex".
export default {
  providers: [{ domain: process.env.CONVEX_SITE_URL ?? "", applicationID: "convex" }],
} satisfies AuthConfig;
