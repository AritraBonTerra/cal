import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

// Convex accepts the JWTs Better Auth mints at /api/auth/convex/token (issuer: this
// deployment's site URL, audience "convex"), verified against its JWKS route.
export default { providers: [getAuthConfigProvider()] } satisfies AuthConfig;
