import { expect, test } from "bun:test";
import { createJoin } from "../src/main/meetings";

const ZOOM = "https://us02web.zoom.us/j/81234567890?pwd=abc";
const APP = "zoommtg://us02web.zoom.us/join?action=join&confno=81234567890&pwd=abc";

// A join with `zoom` installed or not, recording what it opens; `broken` URLs won't open.
function joiner(zoom: boolean, broken: string[] = []) {
  const opened: string[] = [];
  const join = createJoin({
    handlerFor: (url) => (zoom && url.startsWith("zoommtg:") ? "zoom.us" : ""),
    open: async (url) => {
      if (broken.includes(url)) throw new Error("no");
      opened.push(url);
    },
  });
  return { join, opened };
}

test("a Zoom link opens in Zoom when it's installed, else in the browser", async () => {
  const installed = joiner(true);
  expect(await installed.join(ZOOM)).toBe(true);
  expect(installed.opened).toEqual([APP]);
  const missing = joiner(false);
  expect(await missing.join(ZOOM)).toBe(true);
  expect(missing.opened).toEqual([ZOOM]);
});

test("falls back to the browser when the app won't open", async () => {
  const { join, opened } = joiner(true, [APP]);
  expect(await join(ZOOM)).toBe(true);
  expect(opened).toEqual([ZOOM]);
});

test("other services open at their https link", async () => {
  const { join, opened } = joiner(true);
  await join("https://meet.google.com/abc-defg-hij");
  expect(opened).toEqual(["https://meet.google.com/abc-defg-hij"]);
});

test("opens nothing that isn't a call", async () => {
  const { join, opened } = joiner(true);
  for (const url of [
    "https://example.com",
    "file:///etc/passwd",
    "zoommtg://zoom.us/join?confno=1",
    "ical://ekevent/1",
    "",
    null,
    { url: ZOOM },
  ]) {
    expect(await join(url)).toBe(false);
  }
  expect(opened).toEqual([]);
});
