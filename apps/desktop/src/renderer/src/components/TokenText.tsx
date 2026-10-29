import type { Token } from "@cal/nlp";
import { type KeyboardEvent as ReactKeyboardEvent, type RefObject, useEffect, useRef } from "react";
import { backspaceTarget, isHighlighted, pieces, tokenKey } from "../lib/entryText";

/*
 * A one-line text field whose recognized spans light up (research/10 §4.5 and §4.7).
 * The input's own text is transparent; a mirror over it draws the same text with each
 * token styled by confidence: solid for certain and likely, a dotted underline for a
 * guess, faint for a suggestion that isn't applied, and lighter while still being
 * typed. Clicking a highlight un-parses it, and Backspace right after a token was
 * recognized un-parses it instead of deleting a character.
 */

interface TokenTextProps {
  value: string;
  tokens: readonly Token[];
  onChange: (text: string) => void;
  onUnparse: (token: Token) => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
  label: string;
  // Font and padding, applied to the input and its mirror alike.
  className: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  disabled?: boolean;
}

// The highlight for a token, by how sure the parser is and whether it's applied.
export function tokenClass(token: Token) {
  if (!token.applied) {
    return "underline decoration-dotted decoration-edge-strong underline-offset-[3px] text-ink-2";
  }
  if (token.pending) return "rounded-xs bg-hover text-ink-2";
  const base = "rounded-xs bg-accent-soft text-accent";
  return token.confidence === "guess"
    ? `${base} underline decoration-dotted underline-offset-[3px]`
    : base;
}

export function TokenText({
  value,
  tokens,
  onChange,
  onUnparse,
  onKeyDown,
  placeholder,
  label,
  className,
  inputRef,
  autoFocus,
  disabled,
}: TokenTextProps) {
  const own = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? own;
  const mirror = useRef<HTMLDivElement>(null);
  // Long text scrolls inside the input; the mirror follows so highlights stay aligned.
  const sync = () => {
    if (mirror.current && ref.current) mirror.current.scrollLeft = ref.current.scrollLeft;
  };
  useEffect(sync);
  // Tokens known before the latest edit, so Backspace can tell a fresh token apart.
  const before = useRef(new Set<string>());
  const seen = useRef({ value, keys: new Set<string>() });
  useEffect(() => {
    if (seen.current.value !== value) before.current = seen.current.keys;
    seen.current = { value, keys: new Set(tokens.map(tokenKey)) };
  }, [value, tokens]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus, ref]);

  const shown = tokens.filter((token) => isHighlighted(token.kind));

  return (
    <div className="relative">
      <input
        ref={ref}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onScroll={sync}
        onKeyDown={(event) => {
          const input = event.currentTarget;
          if (
            event.key === "Backspace" &&
            !event.metaKey &&
            !event.altKey &&
            input.selectionStart === input.selectionEnd
          ) {
            const target = backspaceTarget(tokens, input.selectionStart ?? 0, before.current);
            if (target) {
              event.preventDefault();
              onUnparse(target);
              return;
            }
          }
          onKeyDown?.(event);
        }}
        placeholder={placeholder}
        aria-label={label}
        spellCheck={false}
        autoComplete="off"
        className={`relative block w-full bg-transparent text-transparent caret-ink outline-none placeholder:text-ink-3 disabled:text-ink ${className}`}
      />
      {value && (
        <div
          ref={mirror}
          aria-hidden
          className={`pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre text-ink ${className}`}
        >
          {pieces(value, shown).map((piece, index) => {
            const { token } = piece;
            // biome-ignore lint/suspicious/noArrayIndexKey: pieces are positional text.
            if (!token) return <span key={index}>{piece.text}</span>;
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: pieces are positional text.
                key={index}
                data-token={token.kind}
                data-confidence={token.confidence}
                data-applied={token.applied ? "" : undefined}
                title={token.applied ? "Click to keep as text" : `Suggestion: ${token.label}`}
                className={`${token.applied ? "pointer-events-auto" : ""} ${tokenClass(token)}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  onUnparse(token);
                }}
              >
                {piece.text}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
