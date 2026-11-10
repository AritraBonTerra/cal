/*
 * The one-time token Better Auth's Electron plugin leaves in the `better-auth.electron`
 * cookie after Google sign-in, read by the handoff page in http.ts. The token is padded
 * base64url (it always ends in `==`) and the cookie holds it URL-encoded (`%3D%3D`), so
 * it's decoded before it's checked; anything that isn't base64url is refused, since the
 * token goes into HTML and a URL.
 */
export function handoffToken(cookieHeader: string) {
  const raw = /(?:^|;\s*)(?:__Secure-)?better-auth\.electron=([^;]+)/.exec(cookieHeader)?.[1];
  if (!raw) return undefined;
  let token: string;
  try {
    token = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  return /^[\w-]+={0,2}$/.test(token) ? token : undefined;
}
