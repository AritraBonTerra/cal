import { keyLabels } from "@cal/app-core";
import { Check, ChevronsUpDown } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from "react";
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
  // A fixed height for panels whose content scrolls inside (Settings).
  height?: number;
  // Floating panels pop from 0.97; sheets drop in from the top like a Mac sheet.
  kind?: "panel" | "sheet";
  label: string;
}

// A centered floating layer over a dimming backdrop. Clicking outside closes it.
export function Overlay({ onClose, children, width, height, kind = "panel", label }: OverlayProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex justify-center bg-[oklch(0_0_0/0.18)]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{ paddingTop: kind === "sheet" ? 0 : height ? "12vh" : "20vh" }}
    >
      <div
        role="dialog"
        aria-label={label}
        className={`h-fit max-h-[76vh] overflow-hidden bg-raised text-ink shadow-float ${
          kind === "sheet" ? "sheet-in rounded-b-xl" : "pop-in rounded-xl"
        }`}
        style={{ width, height }}
      >
        {children}
      </div>
    </div>
  );
}

export interface MenuItem {
  label: string;
  run: () => void;
  // Shown in red, for Remove and the like.
  danger?: boolean;
  // Separator before this item.
  divider?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: readonly MenuItem[];
  onClose: () => void;
}

// A right-click menu at a window point; closes on a click elsewhere or Escape.
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const away = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [onClose]);
  // Keep the menu inside the window.
  const left = Math.min(x, window.innerWidth - 200);
  const top = Math.min(y, window.innerHeight - items.length * 28 - 16);
  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      className="pop-in fixed z-50 w-48 origin-top-left rounded-lg bg-raised p-1 shadow-float outline-none"
      style={{ left, top }}
    >
      {items.map((item) => (
        <div key={item.label}>
          {item.divider && <div className="my-1 h-px bg-grid" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.run();
            }}
            className={`flex h-7 w-full items-center rounded-md px-2 text-left text-body hover:bg-hover disabled:text-ink-3 disabled:hover:bg-transparent ${
              item.danger ? "text-now" : "text-ink"
            }`}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

// A Mac-style switch: 26×16, accent when on.
export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-4 w-[26px] shrink-0 rounded-full transition-colors duration-100 ${
        checked ? "bg-accent-solid" : "bg-edge-strong"
      }`}
    >
      <span
        className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-[0_1px_2px_oklch(0_0_0/0.2)] transition-[left] duration-100"
        style={{ left: checked ? 12 : 2 }}
      />
    </button>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}

// Two to four exclusive choices in one 24px control; the chosen one is raised.
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex h-6 shrink-0 items-center gap-0.5 rounded-md bg-hover p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a segmented control, not a form radio.
          <button
            type="button"
            role="radio"
            aria-checked={active}
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`h-5 rounded-[4px] px-2 text-small transition-colors duration-100 ${
              active
                ? "bg-raised font-medium text-ink shadow-[0_0_0_0.5px_var(--cal-edge),0_1px_2px_oklch(0_0_0/0.08)]"
                : "text-ink-2 hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface SelectProps<T extends string | number> {
  value: T;
  // An option may carry a color, drawn as a dot before its label (calendars).
  options: readonly { value: T; label: string; color?: string }[];
  onChange: (value: T) => void;
  label: string;
  // Width in px, so rows of selects line up.
  width?: number;
  // Shown when `value` matches no option, e.g. "Add…" for a menu that appends.
  placeholder?: string;
  // Borderless: a plain text button that reveals itself on hover (popover rows).
  quiet?: boolean;
}

// A popup button: the current choice with a chevron, opening a menu of the options.
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  width = 144,
  placeholder,
  quiet = false,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  const current = options.find((option) => option.value === value);
  return (
    <div ref={ref} className="relative shrink-0" style={{ width }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((state) => !state)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.stopPropagation();
            setOpen(false);
          }
        }}
        className={`flex h-6 w-full items-center justify-between gap-2 rounded-md pr-1.5 pl-2 text-small hover:bg-hover ${
          quiet
            ? current
              ? "text-ink"
              : "text-ink-3"
            : "bg-raised text-ink shadow-[inset_0_0_0_1px_var(--cal-edge)]"
        }`}
      >
        {current?.color && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: current.color }}
          />
        )}
        <span className="min-w-0 flex-1 truncate text-left">
          {current?.label ?? placeholder ?? String(value)}
        </span>
        <ChevronsUpDown
          size={12}
          strokeWidth={1.5}
          absoluteStrokeWidth
          className="shrink-0 text-ink-3"
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="pop-in absolute right-0 top-7 z-30 max-h-64 w-full min-w-36 origin-top-right overflow-y-auto rounded-lg bg-raised p-1 shadow-float"
        >
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onClick={() => {
                setOpen(false);
                onChange(option.value);
              }}
              className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-body text-ink hover:bg-hover"
            >
              <span className="w-3 shrink-0 text-accent">
                {option.value === value && <Check size={12} strokeWidth={2} absoluteStrokeWidth />}
              </span>
              {option.color && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: option.color }}
                />
              )}
              <span className="truncate">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
