import { LoaderCircle } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import icon from "../../../../../../assets/icon.svg";
import type { UpdateState } from "../../../shared/api";
import { useUpdateState } from "../lib/updates";

// How long "Cal is up to date" stays before it closes itself.
const CURRENT_MS = 5000;

type Shown = Exclude<UpdateState, { status: "idle" }>;

/**
 * The app-update prompt: a card in the window's bottom-right corner that asks whether to
 * install a new version, then shows the download and the restart. It floats over the
 * other panels without dimming or blocking anything, since a background check can raise
 * it mid-work.
 *
 * It never takes focus or keys from the app: a delayed answer that grabbed focus could
 * put a Return meant for something else on Install. Escape closes it while focus is
 * inside.
 */
export function UpdatePrompt() {
  const state = useUpdateState();
  const { status } = state;

  useEffect(() => {
    if (status !== "current") return;
    const timer = setTimeout(() => void window.cal.updates.dismiss(), CURRENT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (state.status === "idle") return null;
  const closable = state.status !== "downloading" && state.status !== "installing";
  return (
    <section
      aria-label="Software update"
      aria-live="polite"
      data-update={state.status}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // Escape here answers the prompt alone, not whatever panel is open behind it.
        event.preventDefault();
        event.stopPropagation();
        if (closable) void window.cal.updates.dismiss();
      }}
      className="rise-in fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl bg-raised p-3 text-ink shadow-float"
    >
      <img src={icon} alt="" width={32} height={32} className="shrink-0" draggable={false} />
      <div className="min-w-0 flex-1">
        <Content state={state} />
      </div>
    </section>
  );
}

// The card's words and buttons for one state.
function Content({ state }: { state: Shown }) {
  const { install, check, dismiss } = window.cal.updates;
  switch (state.status) {
    case "checking":
      return (
        <div className="flex h-8 items-center gap-2 text-body text-ink-2">
          <LoaderCircle
            size={14}
            strokeWidth={1.5}
            absoluteStrokeWidth
            className="motion-safe:animate-spin"
          />
          <span className="flex-1">Checking for updates…</span>
          <Button onClick={() => void dismiss()}>Cancel</Button>
        </div>
      );
    case "current":
      return (
        <>
          <Title>Cal is up to date</Title>
          <Note>Version {state.version} is the newest.</Note>
          <Actions>
            <Button primary onClick={() => void dismiss()}>
              OK
            </Button>
          </Actions>
        </>
      );
    case "available":
      return (
        <>
          <Title>Cal {state.version} is available</Title>
          <Note>You have {state.current}. Installing it restarts Cal.</Note>
          <Actions>
            <Button onClick={() => void dismiss()}>Later</Button>
            <Button primary onClick={() => void install()}>
              Install and Restart
            </Button>
          </Actions>
        </>
      );
    case "downloading":
      return (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <Title>Downloading Cal {state.version}</Title>
            <span className="text-small text-ink-2 tnum">{state.percent}%</span>
          </div>
          <Progress label={`Downloading Cal ${state.version}`} percent={state.percent} />
          <Note>Cal restarts when it's ready.</Note>
        </>
      );
    case "installing":
      return (
        <>
          <Title>Installing Cal {state.version}</Title>
          <Progress label={`Installing Cal ${state.version}`} percent={100} />
          <Note>Restarting…</Note>
        </>
      );
    case "failed":
      return (
        <>
          <Title>
            {state.version ? `Couldn't install Cal ${state.version}` : "Couldn't check for updates"}
          </Title>
          {/* Selectable, so an error can be copied into a report. */}
          <p className="mt-0.5 line-clamp-4 break-words text-small text-ink-2 select-text">
            {state.message}
          </p>
          <Actions>
            <Button onClick={() => void dismiss()}>Close</Button>
            {/* A failed install is tried again; a failed check checks again. */}
            <Button primary onClick={() => void (state.version ? install() : check())}>
              Try Again
            </Button>
          </Actions>
        </>
      );
  }
}

function Title({ children }: { children: ReactNode }) {
  return <h2 className="truncate text-body font-semibold">{children}</h2>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-0.5 text-small text-ink-2">{children}</p>;
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex justify-end gap-2">{children}</div>;
}

// A 28px button; the primary one is filled.
function Button({
  primary,
  onClick,
  children,
}: {
  primary?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 rounded-md px-3 text-small font-medium ${
        primary
          ? "bg-accent-solid text-white"
          : "text-ink shadow-[inset_0_0_0_1px_var(--cal-edge)] hover:bg-hover"
      }`}
    >
      {children}
    </button>
  );
}

// A thin progress bar, 0–100.
function Progress({ label, percent }: { label: string; percent: number }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="mt-2 mb-1.5 h-1 overflow-hidden rounded-full bg-active"
    >
      <div
        className="h-full origin-left rounded-full bg-accent-solid motion-safe:transition-transform motion-safe:duration-150"
        style={{ transform: `scaleX(${percent / 100})` }}
      />
    </div>
  );
}
