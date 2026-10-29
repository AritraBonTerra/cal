import type { Token } from "./types";

export interface Piece {
  text: string;
  token?: Token;
}

/**
 * `text` cut into plain runs and token spans, in order. Tokens that overlap an earlier
 * one are skipped, so a parser hiccup can never duplicate text.
 */
export function pieces(text: string, tokens: readonly Token[]): Piece[] {
  const out: Piece[] = [];
  let cursor = 0;
  for (const token of [...tokens].sort((a, b) => a.start - b.start)) {
    if (token.start < cursor || token.end > text.length) continue;
    if (token.start > cursor) out.push({ text: text.slice(cursor, token.start) });
    out.push({ text: text.slice(token.start, token.end), token });
    cursor = token.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}
