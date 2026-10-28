import { keyLabels } from "@cal/app-core";
import { Check } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { isMac } from "../lib/keyboard";

// Small shared controls, each one a token recipe from research/07 §7.

// One keycap per key: "mod+shift+k" → ⌘ ⇧ K.
export function Keycaps({ binding, className = "" }: { binding: string; className?: string }) {
  return (
    <span className={`inline-flex gap-0.5 ${className}`}>
      {keyLabels(binding, isMac).map((label, index) => (
        <kbd
          // biome-ignore lint/suspicious/noArrayIndexKey: labels repeat (⇧ ⇧) and never reorder.
          key={index}
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-hover px-1 font-sans text-caption font-medium text-ink-2 shadow-[0_0_0_0.5px_var(--cal-edge)] tnum"
        >
          {label}
        </kbd>
      ))}
    </span>
  );
}

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: 12 | 14;
  label: string;
}

// Things-style round-square checkbox: 1.5px outline, accent fill with a white check.
export function Checkbox({ checked, onChange, size = 14, label }: CheckboxProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: drawn to Things' shape; a native input can't be.
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className={`flex shrink-0 items-center justify-center rounded-xs ${
        checked
          ? "bg-accent text-white"
          : "bg-canvas shadow-[inset_0_0_0_1.5px_var(--cal-edge-strong)]"
      }`}
      style={{ width: size, height: size }}
    >
      {checked && <Check size={size - 4} strokeWidth={3} absoluteStrokeWidth />}
    </button>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string };

// A borderless 28px toolbar button; hover shows instantly and fades out.
export function IconButton({ label, className = "", children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`no-drag flex h-7 w-7 items-center justify-center rounded-md text-ink-2 transition-colors duration-100 hover:bg-hover hover:duration-0 active:bg-active ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

interface OverlayProps {
  onClose: () => void;
  children: ReactNode;
  // Pixel width of the panel; it's centered with its top edge at 20% of the window.
  width: number;
  // Floating panels pop from 0.97; sheets drop in from the top like a Mac sheet.
  kind?: "panel" | "sheet";
  label: string;
}

// A centered floating layer over a dimming backdrop. Clicking outside closes it.
export function Overlay({ onClose, children, width, kind = "panel", label }: OverlayProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex justify-center bg-[oklch(0_0_0/0.18)]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{ paddingTop: kind === "sheet" ? 0 : "20vh" }}
    >
      <div
        role="dialog"
        aria-label={label}
        className={`h-fit max-h-[70vh] overflow-hidden bg-raised text-ink shadow-float ${
          kind === "sheet" ? "sheet-in rounded-b-xl" : "pop-in rounded-xl"
        }`}
        style={{ width }}
      >
        {children}
      </div>
    </div>
  );
}
