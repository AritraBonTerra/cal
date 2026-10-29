import type { Token, TokenKind } from "@cal/nlp";

/*
 * Shared pieces of the two natural-language title fields (Quick Entry and the event
 * popover): the un-parsed spans ("literals") that follow the text as it's edited, the
 * leading "event " / "task " prefix, and which tokens show highlighted.
 */

export interface Literal {
  start: number;
  end: number;
}

/**
 * Literals after an edit from `before` to `after`: spans past the changed range shift
 * by the length difference, and any span the edit touched is dropped, so its text is
 * parsed again.
 */
export function shiftLiterals(literals: readonly Literal[], before: string, after: string) {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }
  const changedEnd = before.length - suffix;
  const delta = after.length - before.length;
  return literals.flatMap((literal) => {
    if (literal.end <= prefix) return [literal];
    if (literal.start >= changedEnd)
      return [{ start: literal.start + delta, end: literal.end + delta }];
    return [];
  });
}

// The kind a leading "event " / "task " / "todo " names, if any.
export function prefixKind(text: string): "event" | "task" | undefined {
  const match = /^\s*(task|todo|to-do|reminder|event)\s+/i.exec(text);
  if (!match) return undefined;
  return (match[1] ?? "").toLowerCase() === "event" ? "event" : "task";
}

// A stable key for a recognized span, to tell newly recognized tokens from older ones.
export const tokenKey = (token: Pick<Token, "kind" | "start" | "end">) =>
  `${token.kind}:${token.start}-${token.end}`;

/**
 * The token to un-parse when Backspace is pressed with the caret at `caret`: one that
 * ends exactly there, was recognized by the latest edit (not in `previous`), and isn't
 * the mode prefix.
 */
export function backspaceTarget(
  tokens: readonly Token[],
  caret: number,
  previous: ReadonlySet<string>,
): Token | undefined {
  return tokens.find(
    (token) =>
      token.applied &&
      token.end === caret &&
      token.kind !== "mode" &&
      !previous.has(tokenKey(token)),
  );
}

// Kinds whose spans are highlighted as recognized; the mode prefix is shown as a chip.
export const isHighlighted = (kind: TokenKind) => kind !== "mode";
