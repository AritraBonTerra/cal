import type { ReactNode } from "react";

/*
 * Layout pieces every settings section shares: a group with a caption heading, and a
 * row with the setting's name (and an optional one-line note) on the left and its
 * control on the right. Rows are 44px with a hairline between them.
 */

export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      {title && <h3 className="mb-1 px-1 text-caption font-medium text-ink-3">{title}</h3>}
      <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--cal-grid)]">{children}</div>
    </section>
  );
}

interface RowProps {
  label: string;
  note?: string;
  children: ReactNode;
}

export function Row({ label, note, children }: RowProps) {
  return (
    <div className="flex min-h-11 items-center gap-4 px-3 py-2 [&+&]:border-t [&+&]:border-grid">
      <div className="min-w-0 flex-1">
        <div className="text-body text-ink">{label}</div>
        {note && <div className="text-small text-ink-3">{note}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

// A secondary 24px button for actions inside a row.
export function RowButton({
  onClick,
  children,
  danger,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-6 rounded-md px-2 text-small font-medium shadow-[inset_0_0_0_1px_var(--cal-edge)] transition-colors duration-100 hover:bg-hover hover:duration-0 disabled:opacity-50 disabled:hover:bg-transparent ${
        danger ? "text-now" : "text-ink"
      }`}
    >
      {children}
    </button>
  );
}
