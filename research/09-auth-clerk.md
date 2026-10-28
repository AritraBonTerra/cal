# 09: Auth with Clerk. Google and email sign-in for the Mac (Electron) and iPhone/iPad (Expo)

Researched 2026-10-28. Today Cal uses Convex Auth with email and password. `packages/sync/src/session.ts` keeps the Convex Auth JWT and refresh token in platform storage. Every synced row has `owner_id: v.id("users")`. `requireUserId` calls Convex Auth's `getAuthUserId`. The owner wants Clerk instead, with "Sign in with Google", email, and a nicer sign-in UI.

How to read this:
- Versions come from the npm registry on 2026-10-28.
- **[source]** means I read the package's shipped code (the npm tarball), not just its docs.
- **[unverified]** means only one secondary source supports the claim, or it's my own inference and nothing primary states it.

## The short version

1. **Convex side.** This part is small and well documented. Activate Clerk's Convex integration, which makes the normal session token carry `aud: "convex"`, so no JWT template is needed. Point `auth.config.ts` at the Clerk Frontend API URL and read `ctx.auth.getUserIdentity()`.
2. **Keep `owner_id: v.id("users")`.** Add `tokenIdentifier` to the existing `users` table. Swap `requireUserId` to an index lookup, and add a `users.ensure` mutation that links an existing Convex Auth user by verified email. No synced row changes. Devices keep the same user id, so local data and unsent outboxes carry over.
3. **Electron.** Clerk shipped an official `@clerk/electron` in 2026. It is a beta at 0.1.7. It runs Clerk's real `<SignIn />` UI in the renderer, opens Google in the system browser, returns through a custom-scheme deep link, and stores the client token in the main process with `safeStorage`. It does not give the main process a `getToken()`. Cal's Convex client lives in main, so main should mint Convex tokens itself. It calls Clerk's documented Frontend API (`POST /v1/client/sessions/{id}/tokens`, native mode) with the client token the bridge already stores there. The renderer's Clerk UI is then needed only to sign in.
4. **Expo.** `@clerk/clerk-expo` is deprecated; use `@clerk/expo` 4.14.4, which supports Expo 54 through 58. Hosted auth (Account Portal in an auth session) and browser OAuth via `useSSO()` work in Expo Go. Native Google sign-in and the SwiftUI `<AuthView />` need a dev build. Cal's non-React `Session` gets tokens from `getClerkInstance().session?.getToken()`.
5. **Offline.** The app opens and works offline either way, since it's local-first. Clerk only blocks *sync*, and only once the Clerk session itself ends. On the free Hobby plan that happens a fixed **7 days after sign-in, whether or not the user is active**. Pro ($25/mo) lets you set 5 minutes to 10 years. That is the main product wart.
6. **Cost.** Hobby is free up to 50,000 monthly retained users and includes a custom domain. It caps social connections at 3 and shows Clerk branding. Production needs a domain you own with DNS access, plus your own Google Cloud OAuth client.

---

## 1. Convex + Clerk

### auth.config.ts
Both vendors document the same shape. Only the env var name differs: Convex's docs use `CLERK_JWT_ISSUER_DOMAIN` and Clerk's use `CLERK_FRONTEND_API_URL`. The value is the same Frontend API URL, so pick one.

```ts
// packages/backend/convex/auth.config.ts
export default {
  providers: [{ domain: process.env.CLERK_FRONTEND_API_URL!, applicationID: "convex" }],
} satisfies AuthConfig;
```
- The value is `https://verb-noun-00.clerk.accounts.dev` in development and `https://clerk.<your-domain>` in production. Set it with `npx convex env set` (dev) and `npx convex env --prod set` (prod). Convex functions don't read the app's `.env`. ([Clerk](https://clerk.com/docs/guides/development/integrations/databases/convex), [Convex](https://docs.convex.dev/auth/clerk))

### JWT template vs the native integration
- **Native integration (current).** In the Clerk Dashboard go to **Integrations > Convex** (`dashboard.clerk.com/apps/setup/convex`) and select "Activate Convex integration". After that, "the default audience (`aud`) claim required by Convex is pre-mapped" in **Sessions > Claims**, and the ordinary session token works. ([Clerk](https://clerk.com/docs/guides/development/integrations/databases/convex))
- **Legacy template.** Convex 1.48 still supports the old `convex` JWT template [source]. `ConvexProviderWithClerk` calls `getToken({ skipCache })` when `sessionClaims.aud === "convex"`, and otherwise falls back to `getToken({ template: "convex" })`. A custom client like Cal's should do the same: native token first. (`node_modules/convex/dist/esm/react-clerk/ConvexProviderWithClerk.js`)

### Identity fields
- `getUserIdentity()` always has `tokenIdentifier`, `subject` and `issuer`. `tokenIdentifier` is `iss` + `sub`, which keeps it unique across providers. ([Convex](https://docs.convex.dev/auth/functions-auth))
- Clerk's `sub` is the Clerk user id (`user_123`) and `sid` is the session id. The default session token has no email. ([Clerk default claims](https://clerk.com/docs/guides/sessions/session-tokens))
- Other fields depend on the claims you configure. Convex says the Clerk integration gives `email`, `emailVerified`, `givenName` and so on. That sentence predates the native integration. To be safe, add the claims yourself under **Sessions > Claims**: `{"email": "{{user.primary_email_address}}", "email_verified": "{{user.email_verified}}", "name": "{{user.full_name}}"}`. Shortcodes come from [JWT templates](https://clerk.com/docs/guides/sessions/jwt-templates). Whether the integration adds email by default is [unverified].
- Convex drops Clerk's `fva` claim, because it changes every minute and would rerun every query. ([Convex](https://docs.convex.dev/auth/functions-auth))
- Keep custom claims under about 1.2 KB. ([Clerk](https://clerk.com/docs/guides/sessions/session-tokens))

### Storing users
Convex documents two ways to do this ([Storing users](https://docs.convex.dev/auth/database-auth)):
1. **Upsert on first call.** A `store` mutation looks up `users` by `tokenIdentifier` (index `by_token`), and inserts or patches. It can only store what the JWT carries.
2. **Clerk webhooks.** An `http.ts` route `/clerk-users-webhook` on the `.convex.site` domain verifies with svix (`CLERK_WEBHOOK_SECRET`) and handles `user.created`, `user.updated` and `user.deleted`. The user is keyed by `externalId` (the Clerk `sub`). This is the only way to get data that isn't in the JWT, and the only way to hear about deletions.

Cal needs no profile data beyond email, so option 1 is enough. Add the webhook later only if you want `user.deleted` to wipe the user's rows.

### Migrating from Convex Auth with the least churn
`getAuthUserId` just splits `subject` on `|` and returns the first part [source] (`@convex-dev/auth/dist/server/implementation/index.js:342`). With a Clerk token it would return `user_2abc…` typed as `Id<"users">`. So `requireUserId` has to change. Nothing else in the backend does: only `sync.upload` (a mutation) and `sync.pull` (a query) call it.

The plan:
1. **Keep `owner_id: v.id("users")` everywhere.** Extend the `users` table rather than replacing it. `authTables` is a plain object, so `{ ...authTables, users: defineTable({ ...legacy Convex Auth fields, tokenIdentifier: v.optional(v.string()) }).index("email", ["email"]).index("by_token", ["tokenIdentifier"]) }` keeps Convex Auth working during the switch. The legacy fields are name, image, email, emailVerificationTime, phone, phoneVerificationTime and isAnonymous (`@convex-dev/auth/dist/server/implementation/types.js`).
2. **`requireUserId(ctx)`** reads the identity, looks up `users` by `by_token`, and throws `NOT_AUTHENTICATED` if there is no row. Queries can't insert, which is why step 3 exists.
3. **`users.ensure` mutation.** Devices call it once after Clerk sign-in. It returns the Convex `_id`:
   - If a row with this `tokenIdentifier` exists, return it.
   - Otherwise, if `email` is present and `email_verified` is true, find a Convex Auth user with that email and no `tokenIdentifier`, patch in `tokenIdentifier`, and return its `_id`.
   - Otherwise insert a new user.
4. **Both providers in `auth.config.ts` during the switch.** The array takes several entries. Remove the Convex Auth entry once every device has moved.
5. **Remove `@convex-dev/auth` afterwards.** That means `convexAuth`, `auth.addHttpRoutes`, the `auth*` tables and the Convex Auth env vars (JWT private key, JWKS). It doesn't *have* to go on day one. It has to stop being the source of `requireUserId`. Whether Convex refuses a schema push that drops a table still holding documents is [unverified]. Empty the `auth*` tables first anyway.

Why this keeps churn low: devices key local data by user id (`LocalStore.setUser` parks the outbox and server rows per user). Linking by email returns the *same* `_id`, so an existing install signs in with Clerk, gets its old user id back, and uploads any unsent edits. If the owner column switched to the Clerk `sub`, you would have to rewrite every row and index. Every device would also park its data under the old id and strand its outbox.

A trust note on linking: Clerk has verified the email, by code or by Google. Convex Auth's `Password` provider never verified emails. Someone who had signed up to Convex Auth with your address would therefore hand you their data, not the reverse. For a one-person app that's harmless. For a product, link only accounts you migrate on purpose [inference].

---

## 2. Clerk in Electron

### What's official in 2026
- **`@clerk/electron` 0.1.7.** It was published 2026-10-27, first created 2026-06-15, and its README says "beta. APIs may change before 1.0". Peers are `electron >=28` and React 18/19. `electron-store` and `@clerk/electron-passkeys` are optional. It has five entry points: main (`createClerkBridge`), `/preload` (`exposeClerkBridge`), `/react` (`ClerkProvider` + all of `@clerk/react`), `/storage`, and `/passkeys`. ([README in tarball](https://github.com/clerk/javascript/tree/main/packages/electron), [quickstart](https://clerk.com/docs/electron/getting-started/quickstart), [example repo](https://github.com/clerk/clerk-electron-quickstart))
- **What it actually does** [source]:
  - The renderer runs `@clerk/clerk-js` in native mode. Every Frontend API request gets `credentials: "omit"`, `_is_native=1`, and `Authorization: Bearer <client JWT>`. The client JWT comes from main over IPC under the key `__clerk_client_jwt`, and main saves any rotated token from the response's `Authorization` header. This replaces cookies, which is why the old `file://` cookie problems no longer apply.
  - Main exposes only token-cache IPC (get/save/clear), checked to come from a window's main frame, plus an OAuth transport.
  - The OAuth transport calls `shell.openExternal(url)` (the system browser), registers the scheme with `app.setAsDefaultProtocolClient`, and waits up to 3 minutes for `open-url` on macOS or `second-instance` on Windows/Linux. Only a URL matching `scheme://host/` with the right `__clerk_oauth_attempt` id is accepted.
  - The prebuilt UI (`ClerkUI`) is **loaded from Clerk's CDN at runtime**, so the renderer CSP must allow the Frontend API host plus Cloudflare Turnstile.
  - `storage()` is `electron-store` plus `safeStorage`. When encryption isn't available, it keeps the token in memory only (PR #9588).
- **There is no main-process `getToken()`.** The session token exists only in the renderer's clerk-js.
- **Requirements from the docs** ([OAuth deep links](https://clerk.com/docs/guides/configure/auth-strategies/oauth-deep-links), [deploy](https://clerk.com/docs/guides/development/deployment/electron)):
  - Enable the Native API (Dashboard > Native applications).
  - Serve the packaged renderer from a custom scheme with `protocol.handle()`, because "Clerk doesn't treat `file://` as a valid redirect origin".
  - Add the scheme origin to `allowed_origins` through `PATCH /v1/instance`.
  - Allowlist `scheme://host/` under "Allowlist for mobile SSO redirect".
  - Declare the scheme in `Info.plist` `CFBundleURLTypes`.
  - Code-sign the app. Without a signature, the Keychain lookup fails and users start signed out on every launch.
  - On macOS, deep links reach only a **packaged** app, so you can't test Google sign-in from the dev server.
- **Open edges** (GitHub, clerk/javascript):
  - A loopback (`http://127.0.0.1`) redirect strategy was proposed and closed unmerged (#9044).
  - The token file is world-writable `0666`, and the fix is still open (#9971). Cal sidesteps it by passing its own storage adapter.
  - Several OAuth-flow fixes landed in October 2026 (#10334, #10337).

### Community approaches before the SDK, and why they hurt
- **Clerk in a `file://` renderer.** Clerk's web mode relies on the `__client` cookie on the FAPI domain ([How Clerk works](https://clerk.com/docs/guides/how-clerk-works/overview)), and that cookie doesn't flow from `file://`. Redirect URLs back to `file://` aren't allowed either.
- **Google inside a BrowserWindow or webview.** Google blocks OAuth in embedded webviews ([Clerk Google guide](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google), [Google](https://developers.googleblog.com/en/modernizing-oauth-interactions-in-native-apps-for-better-usability-and-security)). The system browser is the only reliable route.
- **Sign-in tokens.** Signing in on a website and having a backend mint a sign-in token for the app needs a server with the secret key. Cal has no web app, and Clerk says never to put `CLERK_SECRET_KEY` in an Electron app.

The official SDK supersedes these approaches, so use it.

### The flow for Cal (Convex client in the main process)
The problem: Convex needs a fresh 60-second Clerk session token roughly every 50 seconds. Clerk mints it in a renderer that may not exist. On macOS Cal keeps running with every window closed (`window-all-closed` doesn't quit), and the window might start offline.

The recommendation is that **main mints Convex tokens with the Frontend API, and the renderer hosts Clerk's UI only to sign in**.

1. **Bridge in main.** Call `createClerkBridge({ storage: calStorage, renderer: { scheme: "cal-desktop", host: "renderer" }, userAgent: "Cal/x.y" })` before `app.whenReady()`.
   - `calStorage` is our own `TokenStorage` over the existing `safeStorage` file (`apps/desktop/src/main/session.ts`), with mode `0600`.
   - Use a scheme distinct from the iOS app's `cal`, because an iPad app can also run on Apple Silicon Macs [inference].
2. **Serve the renderer from `cal-desktop://renderer/`** in packaged builds with `protocol.handle`. Keep the Vite dev server in development. Update `isAppUrl` to match.
3. **Use a separate sign-in window** (`cal-desktop://renderer/sign-in.html`). It mounts `<ClerkProvider>` from `@clerk/electron/react` with `<SignIn />` / `<UserProfile />`, and its preload calls `exposeClerkBridge()`.
   - Only this page's CSP allows the Frontend API host, `challenges.cloudflare.com` and `*.protect.clerk.com`.
   - The main Cal window keeps its strict `default-src 'self'` CSP and never runs remote code next to the data bridge. Electron's [security checklist](https://www.electronjs.org/docs/latest/tutorial/security) favours exactly this.
4. **Google.** Clerk's UI asks main for the redirect URL, main opens the system browser, and Google sends the user back to Clerk. Clerk then sends them to `cal-desktop://renderer/?__clerk_oauth_attempt=…`. macOS fires `open-url`, the renderer's clerk-js reloads the client, and the session is active. Email (code or password) runs entirely in the window.
5. **Handoff to main.** When the sign-in window sees a session, it sends a bare "signed in" IPC. Main doesn't trust anything in that message:
   - It reads the stored client JWT and calls `GET {fapi}/v1/client?_is_native=1` with `Authorization: Bearer <client JWT>`. The response's `response.last_active_session_id` gives the session id.
   - It mints a token and calls `users.ensure` to get the Convex user id.
   - It persists `{ convexUserId, email, sessionId }` and calls `engine.start(convexUserId)`.
   - Then the sign-in window can close.
6. **Token fetcher in main.** This replaces `Session.token()`. It calls `POST {fapi}/v1/client/sessions/{sid}/tokens?_is_native=1` with the client JWT as Bearer, and the response is `{ jwt }`. The endpoint and the "ProductionNativeApp" bearer plus `_is_native` scheme are both in Clerk's [Frontend API OpenAPI spec](https://clerk.com/docs/reference/spec/fapi/latest.json). How each result is handled:
   - If the cached JWT has more than ~10 s left and Convex didn't ask for a forced refresh, return it.
   - On a network error, return `null`. The existing backoff in `onAuth` retries.
   - On 401/404, the session has ended or been revoked. Set `needsSignIn`.
   - Save any `Authorization` header in the response as the new client JWT. Use compare-and-swap, as `@clerk/expo` does, so a stale write from the renderer and a write from main don't overwrite each other [source; how much races matter here is inference].
   - Mirror the query params clerk-js sends (for example `__clerk_api_version`) if Clerk starts requiring them [unverified].
7. **Restart and offline.** On launch, main reads `{ convexUserId, … }` and starts the engine at once. The window and data never wait on Clerk. Tokens arrive when the network does.
8. **Sign-out.** Clear local state immediately (as today). Then, as best effort, call `POST {fapi}/v1/client/sessions/{sid}/end`, or have the sign-in window call `clerk.signOut()`, and clear the client JWT.

Where the secret lives: the long-lived **client JWT** is the only durable secret. It sits in main, encrypted with `safeStorage` (Keychain-backed on macOS), and never touches the main window. Session tokens live 60 s and stay in main's memory.

The fallback, if calling the Frontend API from main breaks on a Clerk change: keep a hidden window with `ClerkProvider` mounted and have main pull `session.getToken()` from it over IPC. It works, but it keeps a renderer alive for auth and puts remote code in every launch.

---

## 3. Clerk in Expo (SDK 58)

- **Package.** Use `@clerk/expo` 4.14.4 (published 2026-10-27; peer `expo >=54 <59`, `react-native >=0.75`). `@clerk/clerk-expo` 2.20.0 is marked deprecated with "Migrate to @clerk/expo … Core 3 upgrade guide" (npm, 2026-10-28).
- **Three approaches** ([Expo quickstart](https://clerk.com/docs/expo/getting-started/quickstart)):

  | Approach | UI | Dev build? |
  |---|---|---|
  | Hosted auth (`useHostedAuth` from `@clerk/expo/hosted-auth`) | Account Portal in an auth session | No, works in Expo Go |
  | Native components (`<AuthView />` from `@clerk/expo-native-components`) | SwiftUI / Jetpack Compose | Yes |
  | Custom flow (`useSignIn`, `useSSO`) | Your RN components | No, "native sign-in requires one" |
- **Google.**
  - *Browser OAuth* (`useSSO({ strategy: "oauth_google" })`, or hosted auth) uses `expo-web-browser`/`expo-auth-session` and works in Expo Go. In Expo Go, "Expo supplies a development callback" ([hosted auth](https://clerk.com/docs/expo/guides/account-portal/hosted-auth), [useSSO](https://clerk.com/docs/expo/reference/native-hooks/use-sso)).
  - *Native* Sign in with Google (`useSignInWithGoogle` + `@clerk/expo-google-signin`, or `<AuthView />`) "is not supported in Expo Go". It needs an iOS client ID and a Web client ID in Google Cloud, plus custom credentials in Clerk. ([Sign in with Google](https://clerk.com/docs/expo/guides/configure/auth-strategies/sign-in-with-google))
- **Token cache.** Pass `tokenCache` from `@clerk/expo/token-cache` (`expo-secure-store`, Keychain). Otherwise Clerk keeps the session in memory only. Under the hood it's the same native mode as Electron: `_is_native=1`, an `authorization` header carrying the client JWT, and rotation saved from response headers [source, `dist/provider/singleton/createClerkInstance.js`].
- **Offline start.** `__experimental_resourceCache={resourceCache}` (from `@clerk/expo/resource-cache`) boots Clerk from cached environment and client data, and lets `getToken()` return a cached token when the network fails. It is experimental. ([Offline support](https://clerk.com/docs/guides/development/offline-support))
- **Fitting Cal's `Session`.** Don't use `ConvexProviderWithClerk`. Cal's Convex client sits behind `@cal/sync`'s `Session`. Hand it a token function backed by `getClerkInstance()` ([outside components](https://clerk.com/docs/guides/development/access-clerk-outside-components)):
  - `getToken(force)` returns `clerk.session?.getToken({ skipCache: force })`, and `null` on throw.
  - Listen with `clerk.addListener` to notice sign-in and sign-out.
  - Mount `<ClerkProvider>` for the sign-in screens, but **don't gate the app** on `isLoaded`. The convex source also notes "Clerk's Expo useAuth hook is not memoized", one more reason to stay out of the React path.

---

## 4. Offline behaviour

- **Opening the app offline.** This works on both platforms if Cal persists `{ convexUserId, email }` itself (as `session.bin` and the Keychain entry do today) and starts the engine from that. Clerk isn't on the critical path. The Convex client stays unauthenticated until a token arrives, and the existing backoff retries.
- **How long a session lasts.** Clerk has two layers ([How Clerk works](https://clerk.com/docs/guides/how-clerk-works/overview), [Session options](https://clerk.com/docs/guides/secure/session-options)):
  - The **client token** lasts as long as the Clerk session.
  - The **session token** expires after 60 s. SDKs refresh it every 50 s.
- **Lifetime settings.**
  - *Maximum lifetime* defaults to 7 days and is enabled on new instances. Changing it "requires a paid plan for production use".
  - *Inactivity timeout* is off by default and also paid in production.
  - Hobby's pricing line is "Fixed, 7 day session lifetime". Pro offers "Set a maximum session duration, from 5 minutes to 10 years" ([pricing](https://clerk.com/pricing)).
- **Offline for days.**
  - Back within the session lifetime, the next token call succeeds and sync resumes with no prompt.
  - Past it, the Frontend API rejects the client token (401). Cal sets `needsSignIn` and keeps working locally, with the outbox intact. Signing in again with the same account returns the same Convex `_id` through `users.ensure`, and the outbox uploads.
  - The same happens after a sign-out or revocation elsewhere, detected within about a minute when online.
- **The catch.** Maximum lifetime counts from sign-in, not from last activity. On Hobby, every device will ask to sign in again each week even with daily use. For a calendar that's poor. Budget for Pro (or a long lifetime on Pro) before real users arrive.

---

## 5. Pricing, limits and setup

### Clerk ([pricing](https://clerk.com/pricing), fetched 2026-10-28)
- **Hobby (free).**
  - Includes 50,000 MRU per app. An MRU is a user who comes back at least one day after signing up ("First Day Free").
  - Includes a custom domain.
  - Allows up to 3 social connections.
  - Fixes the session lifetime at 7 days and shows Clerk branding.
  - Excludes native biometric sign-in.
- **Pro.**
  - $25/mo, or $20/mo billed annually.
  - Overage is $0.02/MRU from 50,001 to 100,000, dropping at higher tiers.
  - Adds custom session lifetime and branding removal.
- **Development instances** cap at 100 users and are rate-limited at 100 Frontend API requests per 10 s (production allows 1000) ([environments](https://clerk.com/docs/guides/development/managing-environments), [limits](https://clerk.com/docs/guides/how-clerk-works/system-limits)). Dev instances let you try paid features, so a personal build could live on one with a long session lifetime. It isn't meant for production use, though [inference].
- **Production** needs a domain you own and DNS records (a CNAME for `clerk.<domain>` and the email records listed on the Domains page). A production Electron app needs one "even when your Electron app has no website". SSO connections and Integrations are **not** copied from dev. ([production](https://clerk.com/docs/guides/development/deployment/production), [Electron deploy](https://clerk.com/docs/guides/development/deployment/electron))
- **Google in production** needs your own OAuth client. Dev uses Clerk's shared credentials. The Google app must be set to "In production" publishing status, or it is limited to 100 test users. ([Google guide](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google))

### Convex
Clerk is a standard OIDC provider through `auth.config.ts`. I found no plan restriction on it in Convex's docs, so the Starter plan should be fine [unverified].

### Dashboard checklist
**Clerk (dev instance first)**
1. Create the application. Enable Email (verification code, and password if you want it) and Google under **SSO connections**.
2. Under **Native applications**, enable the Native API. Add the iOS app (Team ID and bundle `dev.aritra.cal`). Add `cal-desktop://renderer/` and the iOS callback under "Allowlist for mobile SSO redirect".
3. Under **Integrations > Convex**, select Activate and copy the Frontend API URL.
4. Under **Sessions > Claims**, confirm `aud: convex`. Add `email`, `email_verified` and `name`.
5. Set allowed origins with `PATCH https://api.clerk.com/v1/instance` and the secret key. The body is `{"allowed_origins": ["cal-desktop://renderer", "http://localhost:5173"]}`. This replaces the whole list. Leave localhost out in prod.
6. For production:
   - Create the production instance and add the domain and DNS records, then deploy certificates.
   - Repeat steps 1 to 5 there.
   - Under **Sessions**, set the maximum lifetime (Pro).

**Google Cloud**

7. Create a project and an OAuth consent screen (External). Create a **Web application** client with Clerk's "Authorized Redirect URI", and paste its ID and secret into Clerk's Google connection ("Use custom credentials").
8. For native iOS Google sign-in later, add an **iOS** client (bundle id) as well.
9. Publish the consent screen "In production".

**Convex**

10. Run `npx convex env set CLERK_FRONTEND_API_URL https://<slug>.clerk.accounts.dev` and the `--prod` equivalent with `https://clerk.<domain>`, then deploy.
11. After the migration, remove Convex Auth's env vars and routes.

**Apps**

12. Desktop:
    - Bake in the publishable key and Frontend API host (`MAIN_VITE_…`/`RENDERER_VITE_…`).
    - Add `protocols: [{ name: "Cal", schemes: ["cal-desktop"] }]` to `electron-builder.yml`.
    - Sign builds (`CSC_NAME`). `safeStorage` needs a real signature, and that is already true of today's `session.bin`.
13. iOS:
    - Set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`.
    - Add the `@clerk/expo` plugin to `app.json`.
    - Install `expo-auth-session`, `expo-web-browser` and `expo-crypto` for hosted auth and `useSSO`.

---

## 6. Alternatives (one line each)

- **Convex Auth + Google.** Free, no MAU billing, sessions as long as you like. Still "beta" in Convex's docs (`@convex-dev/auth` 0.0.96, 2.0 in beta). Its OAuth expects a web redirect to the Convex site, and you'd build the system-browser plus deep-link handoff for Electron yourself, and the sign-in UI too. ([Convex Auth](https://docs.convex.dev/auth/convex-auth))
- **Better Auth** (`@convex-dev/better-auth` 0.12.6, `@better-auth/electron` 1.7.14, `@better-auth/expo` 1.7.14). Runs inside your Convex deployment and has an official Electron plugin (system browser + custom protocol). You own session lifetimes and pay nothing per user. You also write the UI. ([Electron integration](https://better-auth.com/docs/integrations/electron))
- **WorkOS AuthKit.** Convex has first-party docs and can provision a managed WorkOS team. Whether there's an Electron SDK, and how generous the free tier is today, are both [unverified]. ([Convex AuthKit](https://docs.convex.dev/auth/authkit))

If the 7-day Hobby limit or the beta Electron SDK become dealbreakers, Better Auth is the closest fit to Cal's local-first, own-your-data shape.

---

## Recommendation for Cal

### Architecture
**Shared (`@cal/sync`).** `Session` stops knowing about Convex Auth. It takes an auth adapter `{ token(force): Promise<string | null>; signedOut(): boolean }`. It persists only `{ convexUserId, email }` in `SessionStorage`. After a fresh sign-in it calls `users.ensure` once, then `engine.start(convexUserId)`. `needsSignIn`, backoff and `setUser` parking stay as they are.

**Mac.**
- Install `@clerk/electron`, pinned exactly while it's in beta.
- Main creates the bridge with a custom `TokenStorage` over the `safeStorage` file and serves packaged builds from `cal-desktop://renderer`.
- A dedicated sign-in window hosts Clerk's `<SignIn />` (Google + email), loads Clerk's UI under a CSP that only that window gets, and tells main when it's done.
- Main mints Convex tokens itself from the stored client JWT through the Frontend API's native-mode `sessions/{sid}/tokens`. That way sync runs with no window open and nothing in the UI waits on Clerk.

**iPhone/iPad.**
- Install `@clerk/expo` + `tokenCache` + `__experimental_resourceCache`.
- In Expo Go, sign in with `useHostedAuth()` (fastest, Clerk-styled) or a custom screen using `useSignIn` + `useSSO({ strategy: "oauth_google" })`.
- Once Cal moves to a dev build, switch to `<AuthView />` with native Google, which is the nicest iOS UI.
- The token adapter is `getClerkInstance().session?.getToken({ skipCache })`.

### Schema and user migration
1. Spread `authTables`, override `users` with `tokenIdentifier` + index `by_token`, and keep `owner_id: v.id("users")`.
2. `requireUserId` becomes an identity → `by_token` lookup. Add `users.ensure`, which matches by token, then links by verified email, then inserts.
3. `auth.config.ts` lists both Convex Auth and Clerk until every device has updated.
4. Old installs read the old `session.bin` shape, keep `userId`, and show "Sign in to sync". Signing in with the same email returns the same `_id`, so local data and outbox carry over.
5. Then empty the `auth*` tables and remove `@convex-dev/auth`, its http routes, env vars and the password UI.

### Offline story
The app always opens from local data. Clerk only gates sync. Tokens refresh about every 50 s while online and fail softly offline. When the Clerk session ends (7 days after sign-in on Hobby, configurable on Pro), Cal keeps working, flags "Sign in to sync", and uploads the parked outbox after sign-in.

### Checklist
See §5. The short form:
1. Clerk app with Native API, Google + Email, the Convex integration and email claims, allowed origins, and the redirect allowlist.
2. A Google Cloud web OAuth client.
3. `CLERK_FRONTEND_API_URL` in Convex.
4. The `cal-desktop` scheme in electron-builder, and signed builds.
5. The `@clerk/expo` plugin and keys on iOS.
6. Later, the production instance with domain, DNS, and its own Google credentials.

### Risks
- **`@clerk/electron` is beta (0.1.x).** Minting tokens from main relies on the documented Frontend API, but also on the SDK's internal `__clerk_client_jwt` key. Owning the `TokenStorage` adapter lets us see every key, so pin the version and add a test that signs in and mints a token.
- **Seven-day re-sign-in on Hobby.** Plan for Pro once anyone besides the owner uses Cal.
- **Production needs a domain and DNS**, and Google needs its own OAuth app in "In production" status.
- **Remote code.** Clerk's UI loads from its CDN at runtime. Keep it out of the main window.
- **Slow OAuth dev loop on macOS.** Google sign-in only works from a packaged, signed build. Email sign-in works in dev.
- **Expo Go limits.** No native Google button and no `<AuthView />` until the dev build.
- **Account linking by email** is safe for a single user. Tighten it before multi-user migration.

## Sources

**Clerk docs**
- Convex integration: https://clerk.com/docs/guides/development/integrations/databases/convex
- Electron quickstart: https://clerk.com/docs/electron/getting-started/quickstart
- Electron OAuth deep links: https://clerk.com/docs/guides/configure/auth-strategies/oauth-deep-links
- Deploy Electron: https://clerk.com/docs/guides/development/deployment/electron
- How Clerk works (client vs session token, 60 s, 50 s refresh): https://clerk.com/docs/guides/how-clerk-works/overview
- Session tokens (default claims, size): https://clerk.com/docs/guides/sessions/session-tokens
- JWT templates and shortcodes: https://clerk.com/docs/guides/sessions/jwt-templates
- Session options (lifetimes): https://clerk.com/docs/guides/secure/session-options
- Frontend API OpenAPI spec: https://clerk.com/docs/reference/spec/fapi/latest.json
- Rate limits: https://clerk.com/docs/guides/how-clerk-works/system-limits
- Environments (dev cap): https://clerk.com/docs/guides/development/managing-environments
- Production deploy: https://clerk.com/docs/guides/development/deployment/production
- Google social connection: https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google
- Expo quickstart: https://clerk.com/docs/expo/getting-started/quickstart
- Expo hosted auth: https://clerk.com/docs/expo/guides/account-portal/hosted-auth
- Expo useSSO: https://clerk.com/docs/expo/reference/native-hooks/use-sso
- Expo Sign in with Google: https://clerk.com/docs/expo/guides/configure/auth-strategies/sign-in-with-google
- Expo offline support: https://clerk.com/docs/guides/development/offline-support
- Clerk outside components (Expo): https://clerk.com/docs/guides/development/access-clerk-outside-components
- Pricing: https://clerk.com/pricing

**Clerk source and issues**
- `@clerk/electron` 0.1.7 and `@clerk/expo` 4.14.4 tarballs (npm), read 2026-10-28
- Electron CHANGELOG: https://github.com/clerk/javascript/blob/main/packages/electron/CHANGELOG.md
- Loopback redirect (unmerged): https://github.com/clerk/javascript/pull/9044
- Token file permissions (open): https://github.com/clerk/javascript/pull/9971
- OAuth attempt matching: https://github.com/clerk/javascript/issues/10335
- In-memory token fallback: https://github.com/clerk/javascript/pull/9588
- Quickstart repo: https://github.com/clerk/clerk-electron-quickstart

**Convex**
- Convex + Clerk: https://docs.convex.dev/auth/clerk
- Auth in functions (identity fields, Clerk claims): https://docs.convex.dev/auth/functions-auth
- Storing users: https://docs.convex.dev/auth/database-auth
- Convex Auth: https://docs.convex.dev/auth/convex-auth
- WorkOS AuthKit: https://docs.convex.dev/auth/authkit
- `convex` 1.48.0 `react-clerk/ConvexProviderWithClerk.js` and `@convex-dev/auth` 0.0.96 source in `node_modules`

**Other**
- Google on embedded webviews: https://developers.googleblog.com/en/modernizing-oauth-interactions-in-native-apps-for-better-usability-and-security
- Electron security checklist: https://www.electronjs.org/docs/latest/tutorial/security
- Better Auth Electron: https://better-auth.com/docs/integrations/electron

**Package versions:** `https://registry.npmjs.org/<pkg>` dist-tags, fetched 2026-10-28: `@clerk/electron` 0.1.7, `@clerk/electron-passkeys` 0.0.3, `@clerk/expo` 4.14.4, `@clerk/clerk-expo` 2.20.0 (deprecated), `@clerk/clerk-js` 6.42.0, `@clerk/react` 6.18.3, `convex` 1.48.0, `@convex-dev/auth` 0.0.96, `@convex-dev/better-auth` 0.12.6, `@better-auth/electron` 1.7.14.
