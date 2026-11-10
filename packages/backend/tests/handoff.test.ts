import { describe, expect, test } from "bun:test";
import { base64Url } from "@better-auth/utils/base64";
import { handoffToken } from "../convex/handoff";

// A token as the Electron plugin makes it: padded base64url of { identifier, state }.
const state = "AbCdEfGhIjKlMnOp";
const token = base64Url.encode(
  new TextEncoder().encode(JSON.stringify({ identifier: "x".repeat(32), state })),
);
// The cookie holds it URL-encoded, as Better Auth sets cookies.
const cookie = `better-auth.electron=${encodeURIComponent(token)}`;

// What the desktop app does with the token it's handed (@better-auth/electron's authenticate).
const stateIn = (handedOff: string) =>
  JSON.parse(new TextDecoder().decode(base64Url.decode(decodeURIComponent(handedOff)))).state;

describe("handoffToken", () => {
  test("keeps the padding the cookie encodes", () => {
    expect(token.endsWith("==")).toBe(true);
    expect(handoffToken(`theme=dark; ${cookie}; other=1`)).toBe(token);
  });

  test("hands over a token the app reads the state from, as a link or a pasted code", () => {
    const found = handoffToken(cookie) ?? "";
    expect(stateIn(encodeURIComponent(found))).toBe(state);
    expect(stateIn(found)).toBe(state);
  });

  test("reads the __Secure- cookie name", () => {
    expect(handoffToken(`__Secure-${cookie}`)).toBe(token);
  });

  test("refuses anything that isn't base64url", () => {
    expect(handoffToken("better-auth.electron=%3Cscript%3E")).toBeUndefined();
    expect(handoffToken("better-auth.electron=%E0%A4%A")).toBeUndefined();
    expect(handoffToken("other=1")).toBeUndefined();
  });
});
