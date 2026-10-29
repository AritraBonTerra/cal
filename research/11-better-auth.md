# 11: Auth with Better Auth. Sign in with Google on the Mac (Electron) and iPhone/iPad (Expo), on Convex

Researched 2026-10-28. Cal uses Convex Auth (`@convex-dev/auth` 0.0.96) with email and password today. `packages/sync/src/session.ts` keeps the Convex Auth JWT and refresh token in platform storage. Every synced row has `owner_id: v.id("users")`, and `requireUserId` calls `getAuthUserId`. The owner picked Better Auth over Clerk (see [09-auth-clerk.md](09-auth-clerk.md)). The one hard requirement is **Sign in with Google on Mac and iPhone/iPad**; email is nice to have.

How to read this:
- Versions come from the npm registry on 2026-10-28.
- **[source]** means I read the package's shipped code: the npm tarballs of `@convex-dev/better-auth` 0.12.6, `better-auth` 1.6.33, `@better-auth/electron` 1.6.33 and `@better-auth/expo` 1.6.33, plus `convex` 1.48.0 and `@convex-dev/auth` 0.0.96 in `node_modules`.
- **[unverified]** means no primary source states it, or it's my own inference.

## The short version

1. **Versions are pinned by the Convex component.** `@convex-dev/better-auth` 0.12.6 (latest, 2026-10-26) peers `better-auth >=1.6.11 <1.7.0`. The `@better-auth/electron` and `@better-auth/expo` packages are versioned in lockstep with `better-auth`, and their 1.7.14 releases peer `better-auth ^1.7.14`. So **everything must sit on the 1.6 line: `better-auth`, `@better-auth/electron` and `@better-auth/expo` all at 1.6.33**. Support for 1.7 is an open, unmerged PR ([convex/better-auth#430](https://github.com/convex/better-auth/pull/430)). 09-auth-clerk.md listed `@better-auth/electron` 1.7.14 next to `@convex-dev/better-auth` 0.12.6, and that pair doesn't install cleanly.
2. **Convex side.** Better Auth runs *inside* the Convex deployment as a component. Its HTTP routes live under `https://charming-dachshund-581.convex.site/api/auth/*`, and its tables (user, session, account, verification, jwks) live in the component. Devices hold a long-lived Better Auth **session token** (a cookie), trade it at `GET /api/auth/convex/token` for a **15-minute RS256 JWT**, and hand that JWT to Convex. In functions, `identity.subject` is the **Better Auth user id** (a component document id, not `Id<"users">`).
3. **Google redirect URI** to register: `https://charming-dachshund-581.convex.site/api/auth/callback/google`. One Google *Web application* client serves both Mac and iOS, because both use the browser flow.
4. **Migration.** Hard cutover; don't run both systems. Both would mint tokens with issuer `CONVEX_SITE_URL` and audience `convex`, the plugin refuses two `convex` providers, and Convex Auth's `/api/auth/callback/` route would shadow Better Auth's. Keep the existing `users` table and its `_id`s, and add `authId`. A Better Auth `user.onCreate` trigger links a new Google user to the existing `users` row by verified email. `owner_id` and every synced row stay untouched. `@convex-dev/auth` can be uninstalled in the same change.
5. **Electron.** `@better-auth/electron` exists and is real: published since 2026-02, versioned with core, docs at better-auth.com. Its client runs **only in the main process**, which suits Cal exactly. Google works by opening the system browser with PKCE. The browser returns through a custom scheme deep link (`dev.aritra.cal://auth/callback#token=…`), and main exchanges the code for a session cookie stored encrypted with `safeStorage`. The catch is that the browser leg ends on a page that has to read a short-lived cookie and redirect into the app. The plugin expects you to host that page in a web app. Cal has none, so Cal serves a ~20-line page from a Convex HTTP route at `/`. Deep links only work in the **packaged** Mac app.
6. **Expo.** `@better-auth/expo` does Google through `expo-web-browser` (`openAuthSessionAsync`) and stores the session cookie in `expo-secure-store`. This **works in Expo Go**, with `exp://` added to trusted origins on the dev deployment. A native Google button needs a dev build and is optional.
7. **Offline.** You own session lifetimes, with no plan limits. The default is 7 days, rolled forward once a day of use. Set it to 60 to 90 days. The app always opens from local data. When the session is dead, Cal shows "Sign in to sync" and keeps the outbox.

---

## 1. Convex + Better Auth

### Packages and versions
| Package | Version | Why this one |
|---|---|---|
| `convex` | 1.48.0 (current) | The component needs `^1.25.0` |
| `@convex-dev/better-auth` | 0.12.6 | Latest. Peer `better-auth >=1.6.11 <1.7.0` |
| `better-auth` | 1.6.33 | Latest on the `release-1.6` dist-tag. The Convex guides say `~1.6.15` |
| `@better-auth/electron` | 1.6.33 | Peer `better-auth ^1.6.33`, `electron >=36`. `conf` is optional |
| `@better-auth/expo` | 1.6.33 | Peer `better-auth ^1.6.33`, plus `expo-linking`, `expo-web-browser`, `expo-constants`, `expo-network`, `expo-secure-store` |

Pin the versions exactly. Better Auth ships many patch releases (91 versions of the Electron package in 8 months).

### Setup (from the [Convex + Better Auth guides](https://labs.convex.dev/better-auth/framework-guides/expo) and [source])

`convex/convex.config.ts` (new):
```ts
import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
const app = defineApp();
app.use(betterAuth);
export default app;
```

`convex/auth.config.ts`:
```ts
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";
export default { providers: [getAuthConfigProvider()] } satisfies AuthConfig;
```
`getAuthConfigProvider()` returns `{ type: "customJwt", issuer: CONVEX_SITE_URL, applicationID: "convex", algorithm: "RS256", jwks: CONVEX_SITE_URL + "/api/auth/convex/jwks" }` [source, `src/auth-config.ts`].

`convex/auth.ts` (the shape Cal needs: no web app, so no `crossDomain`):
```ts
import { createClient, type AuthFunctions, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { electron } from "@better-auth/electron";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth/minimal";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: { user: { onCreate: linkOrCreateAppUser } }, // see §2
});
export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: process.env.CONVEX_SITE_URL,
    database: authComponent.adapter(ctx),
    trustedOrigins: ["dev.aritra.cal:/", "cal://", ...devOrigins],
    session: { expiresIn: 60 * 60 * 24 * 60, updateAge: 60 * 60 * 24 },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        prompt: "select_account",
      },
    },
    plugins: [electron(), expo(), convex({ authConfig })],
  });
```
- **`baseURL` must be set.** Google's guide warns that without it the callback "may fall back to localhost and cause `redirect_uri_mismatch`" ([Better Auth Google](https://www.better-auth.com/docs/authentication/google)). It's also the default `callbackURL` after OAuth (`oauth2/state.mjs`: `c.body?.callbackURL || c.context.options.baseURL`) [source], which the Electron flow relies on (§3).
- `devOrigins` holds `exp://` patterns, only on the dev deployment (§4).

`convex/http.ts`:
```ts
const http = httpRouter();
authComponent.registerRoutes(http, createAuth); // GET+POST pathPrefix /api/auth/
http.route({ path: "/", method: "GET", handler: electronHandoff }); // §3
export default http;
```
`registerRoutes` also adds `/.well-known/openid-configuration` (a redirect to `/api/auth/convex/.well-known/openid-configuration`), unless that route already exists [source]. CORS is only needed for browser clients, so leave it off.

### Environment variables (Convex deployment, `npx convex env set`)
| Var | Secret? | Notes |
|---|---|---|
| `BETTER_AUTH_SECRET` | **yes** | `openssl rand -base64 32`. Signs cookies and encrypts. Rotating it signs everyone out |
| `GOOGLE_CLIENT_ID` | no (public) | From the Web application OAuth client |
| `GOOGLE_CLIENT_SECRET` | **yes** | Same client |
| `CONVEX_SITE_URL` | built in | Convex sets it. Don't set it yourself |
| `SITE_URL` | **not needed** | Only for `crossDomain` (a web front end). Convex Auth's setup may already have set it, and it's harmless |
| `JWKS` (static, optional) | **yes** (contains the private key) | Optional performance tweak ([Convex plugin](https://labs.convex.dev/better-auth/api/convex-plugin)). Skip it at first. Note that **Convex Auth already uses an env var named `JWKS`** (plus `JWT_PRIVATE_KEY`). Delete both at cutover, before you ever reuse the name |

### What reaches Convex functions [source]
- The `convex()` plugin wraps Better Auth's `jwt` plugin with issuer `CONVEX_SITE_URL`, audience `convex`, and expiration `jwt.expirationSeconds ?? 900` (15 min). The algorithm is RS256 when auth.config is `customJwt`.
- **Payload:** the Better Auth user minus `id` and `image` (so `email`, `emailVerified`, `name`, `createdAt`, …), plus `sessionId` and `iat`. **`sub` = the Better Auth user `_id`** (`jwt/sign.mjs`: `getSubject?.(session) ?? session.user.id`).
- So `ctx.auth.getUserIdentity()` returns `subject` = the Better Auth user id, `tokenIdentifier` = `${CONVEX_SITE_URL}|${subject}`, `email`, and `sessionId`. The Convex docs confirm that since 0.8 the subject "is now the user id from the Better Auth user table" ([migrate to 0.9](https://labs.convex.dev/better-auth/migrations/migrate-to-0-9)).
- `authComponent.getAuthUser(ctx)` / `safeGetAuthUser(ctx)` also check that the session (`identity.sessionId`) still exists and hasn't expired. They cost two component queries.
- **`getAuthUserId` from `@convex-dev/auth` must go.** It splits `subject` on `|` and would return a Better Auth id typed as `Id<"users">`.

### Sessions, tokens, refresh [source; [session docs](https://www.better-auth.com/docs/concepts/session-management)]
- **Session token.** An opaque random token stored in the component's `session` table and sent as the `better-auth.session_token` cookie (`__Secure-` prefixed on https). The Convex plugin includes the `bearer` plugin's hook, so `Authorization: Bearer <session token>` works too.
- **Lifetime.** `expiresIn` defaults to 7 days and `updateAge` to 1 day. Any session read more than `updateAge` after the last extension pushes `expiresAt` to now + `expiresIn`. That makes it a *rolling* window measured from last use, not from sign-in. `/convex/token` uses `sessionMiddleware` → `getSession`, so minting a Convex JWT keeps the session alive. HTTP actions can write; reads from inside queries are no-op'd [source, plugin `hooks.before`].
- **Convex JWT.** Mint it with `GET /api/auth/convex/token` (client: `authClient.convex.token()`), which returns `{ token }`. It lasts 15 min, and you can tune that with `convex({ jwt: { expirationSeconds } })`. There is no refresh token. You mint again with the session cookie.
- **Signing keys** live in the component's `jwks` table, created on first use. Convex fetches `/api/auth/convex/jwks` to verify.
- **Revocation.** Sign-out deletes the session. A minted JWT stays valid until it expires (≤15 min) unless functions call `safeGetAuthUser`.

---

## 2. Migrating from Convex Auth

### Can both run at once? Not practically [source]
- **Same issuer.** Convex Auth tokens are `iss = CONVEX_SITE_URL, aud = "convex"` (auth.config `{ domain: CONVEX_SITE_URL, applicationID: "convex" }`). Better Auth's are the same issuer and audience, but with a different key set.
- **The plugin refuses it.** `convex({ authConfig })` throws "Multiple auth providers with applicationID 'convex' detected" (`plugins/convex/index.ts`, `parseAuthConfig`).
- **Routes collide.** Convex Auth registers `pathPrefix` `/api/auth/signin/` and `/api/auth/callback/`, plus exact `/.well-known/openid-configuration` and `/.well-known/jwks.json`. Convex's router picks the **longest** matching prefix (`convex/dist/esm/server/router.js` `lookup`), so Convex Auth would capture `/api/auth/callback/google`. Better Auth would also skip its own well-known redirect, because the path is already taken.
- **Passwords can't move.** Better Auth's Convex docs say the existing-user migration does not cover email/password "due to differences in password hashing" ([community guide, unofficial](https://better-auth.dracodev.me/guides/migrating-existing-users/)) [unverified from first-party docs]. For Cal that's moot: there is one owner, and they will sign in with Google.

So do a **hard cutover in one deploy**. Old app builds keep working locally. Their sync stops because the refresh action is gone, until the new build is installed and the owner signs in with Google.

### Keeping the same user id (minimal churn)
Pattern from [Convex: component user id in app table](https://labs.convex.dev/better-auth/migrations/migrate-to-0-9/migrate-userid/userid-in-app-table) and [Triggers](https://labs.convex.dev/better-auth/features/triggers):

1. **Schema.** Drop `...authTables`. Inline the existing `users` table with all its current optional fields (`name, image, email, emailVerificationTime, phone, phoneVerificationTime, isAnonymous`, from `@convex-dev/auth/dist/server/implementation/types.js`) so existing documents still validate. Add `authId: v.optional(v.string())` and `.index("authId", ["authId"])`, and keep `.index("email", ["email"])`. `owner_id: v.id("users")` stays everywhere.
2. **Trigger `user.onCreate(ctx, authUser)`.** It runs in the same transaction as Better Auth's insert, and if it throws the insert rolls back.
   - If `authUser.emailVerified` (Google sets it from Google's `email_verified`) and a `users` row has that `email` and no `authId`, patch `authId = authUser._id`.
   - Otherwise insert `{ email, name, authId }`.
3. **`requireUserId(ctx)`.** Take `identity.subject`, look up `users` by `authId`, and throw `NOT_AUTHENTICATED` if there's no row. Queries can't insert, but the trigger has already created the row, so no `users.ensure` mutation is needed (unlike the Clerk plan).
4. **`users.me` query.** It returns `{ userId: users._id, email }`. Devices call it once after sign-in, because the JWT's `sub` is no longer the Convex user id.
5. **Cleanup.**
   - Remove `convexAuth`, `auth.addHttpRoutes`, `api.auth.signIn/signOut` and `@convex-dev/auth` (and `@auth/core`).
   - Empty the old `authAccounts`, `authSessions`, `authRefreshTokens`, `authVerificationCodes`, `authVerifiers` and `authRateLimits` tables in the dashboard before dropping them from the schema. Whether Convex rejects a push that removes a non-empty table is [unverified]. As a cautious alternative, keep `authTables` minus `users` for one deploy, then remove them.
   - Delete the `JWT_PRIVATE_KEY` and `JWKS` env vars.

Devices park local data per user id (`LocalStore.setUser`). The owner's Google sign-in returns the same `users._id`, so the parked outbox and server rows come back. `Session.load()` must stop requiring `refreshToken` in the saved shape, so an old `session.bin` or Keychain entry keeps `userId` and shows "Sign in to sync".

**Trust note.** Convex Auth's Password provider never verified emails. Linking a Google user to a password user by email gives the Google account that user's data. That's fine for the one owner. For a multi-user product, link only accounts you migrate deliberately [inference].

---

## 3. Electron (Mac)

### The plugin ([docs](https://www.better-auth.com/docs/integrations/electron), [source])
- **Package.** `@better-auth/electron` was first published 2026-02-07 and lives in the Better Auth monorepo with core's versioning. It is tested against Electron `^43.1.1` (devDependency), and Cal is on 45.1.0. The docs say it supports "two major versions behind the latest stable major release of Electron". There is no beta label.
- **Entry points.**
  - Server: `electron()`.
  - Main-process client: `electronClient` from `/client`.
  - `electronProxyClient` from `/proxy`, for a *web* sign-in page.
  - Preload: `setupRenderer` from `/preload`.
  - `storage` from `/storage`, which needs `conf`.
- **Main only.** "Never expose `authClient` to the renderer". The client's fetch plugin throws unless `process.type === "browser"` [source]. That fits Cal: main already owns the Convex client.
- **Requests from main** get `cookie` (from storage), `electron-origin: <scheme>:/`, `credentials: "omit"` and `x-skip-oauth-proxy`. The server plugin copies `electron-origin` into `Origin`, so `trustedOrigins` must include `"<scheme>:/"` [source].

### How Google sign-in actually flows [source]
1. Main calls `authClient.requestAuth({ provider: "google" })`. It generates `state` and a PKCE verifier (kept **in memory** in `globalThis[Symbol.for("better-auth:electron")]`), then calls `shell.openExternal` on `{baseURL}/api/auth/electron/init-oauth-proxy?provider=google&client_id=electron&code_challenge=…&code_challenge_method=S256&state=…`.
2. On the server, `init-oauth-proxy` calls its own `/sign-in/social`. Its after-hook saves `{client_id, state, code_challenge}` in a signed `transfer_token` cookie, then 302s the browser to Google.
3. Google sends the browser back to `/api/auth/callback/google`. The session is created, and the hook stores a one-time verification value `electron:<identifier>` (300 s) and sets a **non-httpOnly cookie `better-auth.electron`** = base64url `{identifier, state}` (120 s). The browser is then redirected to `callbackURL`. `init-oauth-proxy` forwards only `provider`, so this is the default, `baseURL`, which here is the **site root**.
4. **Something on that origin must read the cookie and navigate to `<scheme>://auth/callback#token=<cookie>`.** The plugin's answer is `electronProxyClient().ensureElectronRedirect()` running in your web app's page. Cal has no web app, so `http.ts` serves `GET /`. It reads `better-auth.electron` from the request's `Cookie` header, clears it (`Max-Age=0`), and returns a tiny HTML page. The page does `location.replace("dev.aritra.cal://auth/callback#token=…")` and also shows an "Open Cal" link and the code for manual paste. The exact path `/` is allowed by Convex's router [source].
5. macOS delivers the URL to the app (`open-url`). Main calls `authClient.authenticate({ token })`, which `POST`s `/electron/token` with the identifier, state and `code_verifier`. The server checks the PKCE S256 challenge, creates a **new session for the app**, and returns `Set-Cookie`. The fetch plugin saves the cookie.

### Where the session lives
The client's `storage` is a **synchronous** `{ getItem(name), setItem(name, value) }`. The plugin itself encrypts values with `safeStorage` and base64-encodes them under keys `better-auth.cookie` and `better-auth.local_cache`. Without encryption available, it keeps them in memory only [source]. Cal should pass its own small adapter over a JSON file in `userData` with mode `0600`, rather than `conf`.

### Main process gets Convex tokens
Use the `convexClient()` plugin from `@convex-dev/better-auth/client/plugins` in the same `createAuthClient` (from `better-auth/client`):
```ts
const { data, error } = await authClient.convex.token({ fetchOptions: { throw: false } });
// data?.token: the JWT. error?.status === 401: the session is gone, so needsSignIn.
// A thrown or network error: offline, so return null and let Session's backoff retry.
```
- **After restart.** The cookie is read from storage on each request, so nothing needs re-initialising.
- **Offline.** The fetch fails → `null` → Convex stays unauthenticated → `Session.onAuth(false)` retries with backoff (existing code).
- **Sign-out.** `authClient.signOut()`. The fetch plugin clears the stored cookie **before** the request goes out, so it signs out locally even offline [source].

### Electron specifics for Cal
- **Scheme.** Use reverse-DNS `dev.aritra.cal` (RFC 8252, and the plugin warns otherwise). It is distinct from the iOS scheme `cal`. Add `protocols: [{ name: "Cal", schemes: ["dev.aritra.cal"] }]` to `electron-builder.yml` so `CFBundleURLTypes` lands in `Info.plist`. "On macOS, you can only register protocols that have been added to your app's `info.plist`" ([app API](https://www.electronjs.org/docs/latest/api/app)).
- **Register `open-url` before `ready`.** "If you register the listener in response to a `ready` event, you'll miss URLs that trigger the launch" ([app API](https://www.electronjs.org/docs/latest/api/app)).
- **Packaged only.** "On macOS and Linux, this feature will only work when your app is packaged" ([deep links tutorial](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app)). In dev, test with the manual-code fallback: paste the code shown on the `/` page into the app, and main calls `authenticate({ token })`.
- **Single instance.** On macOS the OS enforces a single instance for Finder launches, and URLs arrive as `open-url`. Command-line launches bypass that ([app API](https://www.electronjs.org/docs/latest/api/app)).
- **Prefer not to call `setupMain()`.** It does four things:
  - It rewrites the CSP of every response on `defaultSession`.
  - It registers IPC bridges and a privileged `user-image://` protocol.
  - It calls `requestSingleInstanceLock()` and quits if the lock is held. Cal runs `CAL_PROFILE=b` side by side, and whether the lock is per-`userData` is [unverified].
  - It registers the protocol client and the `open-url` handler.

  Cal only needs the last item. Do that in 6 lines of its own: `app.setAsDefaultProtocolClient(scheme)` and `app.on("open-url", …)` calling `authClient.authenticate({ token })`, after checking `dev.aritra.cal://auth/callback#token=`. Set `userImageProxy: { enabled: false }`. The renderer keeps its strict CSP, and no remote code ever loads in it.
- **PKCE verifier is in memory.** If Cal quits between "Sign in with Google" and the browser returning, the exchange fails with "Code verifier not found", and the user retries. A user reported this error intermittently on Electron 43 ([#10433](https://github.com/better-auth/better-auth/issues/10433), closed).
- **Signing.** `safeStorage` is Keychain-backed. Use the same signed build (`CSC_NAME`) as today's `session.bin`.

### Open edges (GitHub, better-auth/better-auth)
- Loopback (`http://127.0.0.1:<port>`) callbacks are an open request ([#10431](https://github.com/better-auth/better-auth/issues/10431)). Only custom scheme or manual code exist today.
- "Electron app stays logged out after a social OAuth flow": multiple `Set-Cookie` headers were collapsed ([#10269](https://github.com/better-auth/better-auth/issues/10269)). This is fixed in 1.6.33, which uses `getSetCookie()` [source].
- `file://` origin checks broke apps in 1.4 ([#7793](https://github.com/better-auth/better-auth/issues/7793)). Cal avoids this because only main talks to the server.

---

## 4. Expo (iPhone/iPad)

From the [Better Auth Expo guide](https://www.better-auth.com/docs/integrations/expo), the [Convex Expo guide](https://labs.convex.dev/better-auth/framework-guides/expo) and [source].

- **Install.** `better-auth@1.6.33 @better-auth/expo@1.6.33 @convex-dev/better-auth@0.12.6`, then `npx expo install expo-network expo-web-browser`. `expo-linking`, `expo-constants`, `expo-secure-store` and `expo-crypto` are already present. All of these ship in Expo Go. The guide targets SDK 55, and SDK 58 compatibility is [unverified], though the peer ranges are open (`>=`).
- **Client.**
  ```ts
  createAuthClient({
    baseURL: CONVEX_SITE_URL,
    plugins: [
      expoClient({ scheme: "cal", storagePrefix: "cal", storage: SecureStore }),
      convexClient(),
    ],
  });
  ```
  Use `better-auth/client` (vanilla) since `Session` isn't React. `storage.getItem` is called **synchronously**, so use `SecureStore.getItem`, which is sync. Keys are `cal_cookie` and `cal_session_data`. Values over the secure-store limit are chunked [source].
- **Google.**
  - `authClient.signIn.social({ provider: "google", callbackURL: "/" })` opens `{baseURL}/api/auth/expo-authorization-proxy?authorizationURL=…` in `WebBrowser.openAuthSessionAsync` (an ASWebAuthenticationSession).
  - After Google, the server redirects to the deep link. The plugin's after-hook appends `?cookie=<Set-Cookie>` when the target is a trusted non-http origin, and the client stores it [source].
  - "On iOS/Android, `signIn.social` won't navigate for you". Await it, then route.
- **Expo Go.** The return URL is `exp://<LAN-IP>:8081/--/…`. The server plugin auto-trusts `exp://` only when `process.env.NODE_ENV === "development"` [source]. Whether the Convex runtime sets that is [unverified], so add `"exp://"`, `"exp://**"` to `trustedOrigins` yourself, gated on a dev-only env var. Production builds use `cal://`.
- **Native Google button (optional, dev build).** Use `@react-native-google-signin/google-signin`, then `signIn.social({ provider: "google", idToken: { token } })`. This needs an **iOS OAuth client** and a server `clientId: [webId, iosId]`. "The array only expands ID token audience verification" ([Google provider](https://www.better-auth.com/docs/authentication/google)). It is not needed to meet the requirement.
- **Session class.** The token adapter is `authClient.convex.token()`, the same code as on the Mac. `getCookie()` exists for any other authenticated fetch.

---

## 5. Offline and expiry

- **The app always opens offline.** Cal persists `{ userId, email }` itself and starts the engine from it. Better Auth is never on the startup path.
- **Online.** Convex calls the token fetcher about every 15 min (JWT lifetime). Each mint extends the session at most once a day.
- **Offline for N days.** If N is under `expiresIn` (recommended 60 days), the next mint succeeds silently and sync resumes. If N is over it, `/convex/token` returns 401. `Session` sets `needsSignIn`, keeps working locally, and keeps the outbox. Signing in again returns the same `users._id`, and the outbox uploads.
- **Revoked elsewhere.** Detected at the next mint (≤15 min online).
- Unlike Clerk Hobby's fixed 7-day lifetime, this is configuration you control at no cost.

---

## 6. Setup checklist for the owner

**Google Cloud** ([Better Auth Google](https://www.better-auth.com/docs/authentication/google), [Convex social sign-in](https://labs.convex.dev/better-auth/framework-guides/expo))
1. Create a project, open **Google Auth Platform**, and fill in:
   - **Branding:** app name "Cal" and a support email.
   - **Audience:** External, publishing status **Testing**, and add your Gmail as a **test user**. Testing allows up to 100 test users.
   - **Data access:** `openid`, `email`, `profile` (Better Auth's defaults). These are non-sensitive.
2. **Clients → Create client → Web application** ("Cal Convex dev"):
   - Authorized redirect URI: `https://charming-dachshund-581.convex.site/api/auth/callback/google`
   - Authorized JavaScript origin (optional): `https://charming-dachshund-581.convex.site`
   - Add the prod deployment's `…convex.site/api/auth/callback/google` to the same client later.
3. An iOS client is not needed for the browser flow. Create one (bundle `dev.aritra.cal`) only if you add the native Google button.
4. Before anyone but you uses it, set the publishing status to **In production**. With only basic scopes, Google shouldn't require verification. Whether brand verification applies to an unlisted app is [unverified].

**Convex (dev deployment)**: the applying agent collects secrets through a secure prompt, never in chat.

5. `BETTER_AUTH_SECRET` (**secret**, generate with `openssl rand -base64 32`).
6. `GOOGLE_CLIENT_ID` (not secret) and `GOOGLE_CLIENT_SECRET` (**secret**).
7. Optional dev-only flag enabling the `exp://` trusted origins for Expo Go.
8. At cutover, delete Convex Auth's `JWT_PRIVATE_KEY` and `JWKS`.

**Apps**

9. Mac: add the `dev.aritra.cal` protocol to `electron-builder.yml`. Sign builds. Google sign-in works only from the packaged app, or via manual code paste in dev.
10. iOS: `scheme: "cal"` is already set. Nothing in Google Cloud is tied to the app for the browser flow.

---

## 7. Risks and unknowns

- **Version lock.** The whole stack is held on Better Auth 1.6.x until convex/better-auth#430 ships. Security fixes then arrive only through `release-1.6` (still published: 1.6.33).
- **Electron browser handoff is DIY.** The `/` handoff page is Cal's code, not the plugin's. The documented path assumes a web app with `electronProxyClient`. Spike it first: confirm the `better-auth.electron` cookie is present on the `/` request after the callback redirect (SameSite=Lax top-level navigation should carry it) [inference].
- **`init-oauth-proxy` calls its own deployment** over HTTP (`betterFetch(baseURL + "/sign-in/social")`). That works from Convex HTTP actions, but it's an extra hop that can fail [inference].
- **Mac deep links need the packaged app**, so the dev loop for Google uses the manual-code fallback.
- **Electron 45 vs tested 43.** The plugin's peer range is `>=36`, but it's untested on 45.
- **Coexistence isn't possible.** One deploy flips auth for every device. Old builds stop syncing until updated.
- **Email/password.** Existing Convex Auth passwords don't carry over. If email is wanted later, enable `emailAndPassword` in Better Auth. Main can call `authClient.signIn.email` directly with no browser. Without email verification, the trust caveat in §2 applies.
- **Expo Go `exp://` trust** must not reach the prod deployment.
- **Convex removing old auth tables** with data is [unverified]. Empty them first.

---

## Recommendation for Cal

**Packages (exact pins)**
- Backend: `better-auth@1.6.33`, `@convex-dev/better-auth@0.12.6`, `@better-auth/electron@1.6.33`, `@better-auth/expo@1.6.33`. Remove `@convex-dev/auth` and `@auth/core`.
- Desktop: `better-auth@1.6.33`, `@better-auth/electron@1.6.33`, `@convex-dev/better-auth@0.12.6` (for `convexClient`). No `conf`.
- Mobile: `better-auth@1.6.33`, `@better-auth/expo@1.6.33`, `@convex-dev/better-auth@0.12.6`, `expo-network`, `expo-web-browser`.

**Backend (`packages/backend/convex`)**
- **`convex.config.ts`** (new): `app.use(betterAuth)`.
- **`auth.config.ts`**: `providers: [getAuthConfigProvider()]`.
- **`auth.ts`**:
  - `authComponent` with the `user.onCreate` trigger that links by verified email, then inserts. Export `triggersApi()`.
  - `createAuth` with `baseURL: CONVEX_SITE_URL`, Google, `electron()`, `expo()`, `convex({ authConfig })`, `session.expiresIn` 60 days, and `trustedOrigins` `["dev.aritra.cal:/", "cal://"]` (+ `exp://` on dev).
  - `requireUserId` → `users.by authId(identity.subject)`.
  - `me` query → `{ userId, email }`.
- **`http.ts`**: `authComponent.registerRoutes(http, createAuth)` and the `GET /` Electron handoff page.
- **`schema.ts`**: drop `authTables`, inline `users` + `authId` + index `authId`, keep `owner_id: v.id("users")`.
- **`sync.ts`**: unchanged, apart from importing the new `requireUserId`.

**Shared (`packages/sync/src/session.ts`)**
- `Session` takes an auth adapter: `{ token(): Promise<string | null | "signedOut">; signIn(): Promise<void>; signOut(): Promise<void> }`.
- It persists only `{ userId, email }` and caches the JWT in memory, using `exp` with 60 s of slack.
- After sign-in it calls `api.users.me`, then `engine.start(userId)`.
- `"signedOut"` (401) → `needsSignIn`. `null` → existing backoff.
- `load()` accepts the old shape (`userId` only).
- Drop `claims().userId` and the `api.auth.signIn/signOut` calls.

**Mac**
- **Main:**
  - `createAuthClient({ baseURL: CONVEX_SITE_URL, plugins: [electronClient({ signInURL: CONVEX_SITE_URL, protocol: { scheme: "dev.aritra.cal" }, storage: encryptedJson(userData/auth.json), userImageProxy: { enabled: false } }), convexClient()] })`.
  - `setAsDefaultProtocolClient` + an `open-url` listener registered before `ready` → `authClient.authenticate({ token })` → `session.signedIn()`.
  - IPC `auth.signInWithGoogle` → `authClient.requestAuth({ provider: "google" })`.
  - IPC `auth.submitCode(code)` for the manual fallback.
  - Don't call `setupMain()`.
- **Preload:** only the two new `AuthCall`s on the existing bridge. No `setupRenderer`.
- **Renderer:** the sign-in sheet gets a "Continue with Google" button, a "Waiting for browser…" state, and a "Paste code" fallback. Email/password is removed, or later re-added via Better Auth.
- **`electron-builder.yml`:** `protocols`.

**iOS**
- `src/data/auth.ts`: `createAuthClient` with `expoClient({ scheme: "cal", storagePrefix: "cal", storage: SecureStore })` + `convexClient()`.
- `app/sign-in.tsx`: "Continue with Google" → `authClient.signIn.social({ provider: "google", callbackURL: "/" })` → `session.signedIn()`.
- `cal.ts`: pass the adapter to `Session`. Works in Expo Go.

**Checklist** (details in §6)
1. Google Cloud project, consent screen in Testing with you as test user, and a Web client with redirect `https://charming-dachshund-581.convex.site/api/auth/callback/google`.
2. Convex env: `BETTER_AUTH_SECRET`🔒, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`🔒, plus the dev-only Expo Go flag.
3. Deploy the backend cutover. Sign in with Google on each device and confirm the same `users._id` (existing data visible, outbox drained).
4. Empty the old `auth*` tables, then remove them and Convex Auth's `JWT_PRIVATE_KEY`/`JWKS` env vars.
5. Build and sign the Mac DMG to test the deep link. Publish the Google app "In production" before other users.

## Sources

**Better Auth**
- Electron integration: https://www.better-auth.com/docs/integrations/electron
- Expo integration: https://www.better-auth.com/docs/integrations/expo
- Google provider: https://www.better-auth.com/docs/authentication/google
- Session management: https://www.better-auth.com/docs/concepts/session-management
- Issues: [#10431 loopback](https://github.com/better-auth/better-auth/issues/10431), [#10433 Electron 43](https://github.com/better-auth/better-auth/issues/10433), [#10269 OAuth cookies](https://github.com/better-auth/better-auth/issues/10269), [#7793 file:// origin](https://github.com/better-auth/better-auth/issues/7793)

**Convex + Better Auth**
- Overview: https://labs.convex.dev/better-auth
- React guide (env, auth.ts shape): https://labs.convex.dev/better-auth/framework-guides/react
- Expo guide (redirect URI on `.site`): https://labs.convex.dev/better-auth/framework-guides/expo
- Triggers: https://labs.convex.dev/better-auth/features/triggers
- Convex plugin options: https://labs.convex.dev/better-auth/api/convex-plugin
- App users table + `authId`: https://labs.convex.dev/better-auth/migrations/migrate-to-0-9/migrate-userid/userid-in-app-table
- Better Auth 1.7 adapter PR (open): https://github.com/convex/better-auth/pull/430

**Electron**
- `app` API (`open-url`, `setAsDefaultProtocolClient`, single instance): https://www.electronjs.org/docs/latest/api/app
- Deep links tutorial: https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app

**Other**
- Community migration guide (unofficial): https://better-auth.dracodev.me/guides/migrating-existing-users/
- Source read 2026-10-28:
  - `@convex-dev/better-auth` 0.12.6: `src/plugins/convex/index.ts`, `src/auth-config.ts`, `src/client/create-client.ts`
  - `better-auth` 1.6.33: `plugins/jwt/sign.mjs`, `api/routes/session.mjs`, `oauth2/state.mjs`, `context/create-context.mjs`
  - `@better-auth/electron` 1.6.33: `dist/index.mjs`, `client.mjs`, `proxy.mjs`, `storage.mjs`
  - `@better-auth/expo` 1.6.33: `dist/index.js`, `client.js`
  - `convex` 1.48.0: `server/router.js`
  - `@convex-dev/auth` 0.0.96: routes, `types.js`

**Package versions:** `https://registry.npmjs.org/<pkg>` dist-tags and peerDependencies, fetched 2026-10-28:
- `better-auth`: latest 1.7.14; `release-1.6` 1.6.33
- `@convex-dev/better-auth` 0.12.6
- `@better-auth/electron`: 1.7.14, or 1.6.33 on `release-1.6`
- `@better-auth/expo`: 1.7.14, or 1.6.33 on `release-1.6`
- `@convex-dev/auth` 0.0.96
- `convex` 1.48.0
