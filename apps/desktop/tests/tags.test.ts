import { describe, expect, test } from "bun:test";
import { parseTags, tagNames } from "../src/renderer/src/lib/tags";

describe("parseTags", () => {
  test("splits on commas and spaces and drops the #", () => {
    expect(parseTags("#writing, admin  deep")).toBe("writing,admin,deep");
  });

  test("drops duplicates and blanks, keeping first order", () => {
    expect(parseTags("a,,b a ,#b")).toBe("a,b");
  });

  test("nothing typed means no tags", () => {
    expect(parseTags("  , # ")).toBe("");
  });
});

describe("tagNames", () => {
  test("reads the stored comma-joined value", () => {
    expect(tagNames("admin,deep")).toEqual(["admin", "deep"]);
    expect(tagNames(undefined)).toEqual([]);
    expect(tagNames("")).toEqual([]);
  });
});
