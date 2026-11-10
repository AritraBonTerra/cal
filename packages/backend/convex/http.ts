import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { handoffToken } from "./handoff";

const http = httpRouter();
authComponent.registerRoutes(http, createAuth);

const MAC_CALLBACK = "dev.aritra.cal://auth/callback#token=";

/*
 * Where the browser lands after Google sign-in started from the Mac app. Better Auth
 * leaves a short-lived `better-auth.electron` cookie for "the web app" to hand to the
 * desktop app; Cal has no web app, so this page does it: it opens Cal through its URL
 * scheme and shows the code to paste for development builds, where links can't open it.
 */
http.route({
  path: "/",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const token = handoffToken(request.headers.get("cookie") ?? "");
    // The app URL-decodes the token, so the link carries it encoded; the code is shown as is.
    const link = token && MAC_CALLBACK + encodeURIComponent(token);
    const body = link
      ? `<p>Signed in. Returning to Cal…</p>
<p><a href="${link}">Open Cal</a></p>
<p>Development build? Paste this code into Cal:</p><pre>${token}</pre>
<script>location.replace(${JSON.stringify(link)});</script>`
      : "<p>Nothing to do here. You can close this tab.</p>";
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Cal</title>
<style>body{font:15px -apple-system,system-ui;max-width:28rem;margin:4rem auto;padding:0 1rem;color:#211f1c}pre{background:#f3f1ef;padding:.75rem;border-radius:6px;white-space:pre-wrap;word-break:break-all}</style>${body}`,
      {
        headers: {
          "content-type": "text/html; charset=utf-8",
          // The cookie is single-use; clear it once read.
          "set-cookie": "better-auth.electron=; Max-Age=0; Path=/; Secure; SameSite=Lax",
          "cache-control": "no-store",
        },
      },
    );
  }),
});

export default http;
