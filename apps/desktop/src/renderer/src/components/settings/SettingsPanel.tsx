import { CalendarDays, Globe, LayoutGrid, type LucideIcon, Settings2, User } from "lucide-react";
import type { AuthState, SyncStatus } from "../../../../shared/api";
import { closeOverlay, type SettingsSection, ui, useUi } from "../../lib/ui";
import { Overlay } from "../ui";
import { AccountSection } from "./AccountSection";
import { CalendarsSection } from "./CalendarsSection";
import { GeneralSection } from "./GeneralSection";
import { GridSection } from "./GridSection";
import { ZonesSection } from "./ZonesSection";

/*
 * Settings (⌘,): a panel over the window with the sections down the left and one
 * section's controls on the right. Every change applies at once; there's no Save.
 */

const SECTIONS: { id: SettingsSection; title: string; icon: LucideIcon }[] = [
  { id: "general", title: "General", icon: Settings2 },
  { id: "grid", title: "Grid", icon: LayoutGrid },
  { id: "zones", title: "Time zones", icon: Globe },
  { id: "calendars", title: "Calendars", icon: CalendarDays },
  { id: "account", title: "Account", icon: User },
];

export function SettingsPanel({ auth, sync }: { auth: AuthState; sync: SyncStatus }) {
  const section = useUi((state) => state.settingsSection);
  const current = SECTIONS.find((each) => each.id === section) ?? SECTIONS[0];
  return (
    <Overlay onClose={closeOverlay} width={760} height={540} label="Settings">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Escape closes the panel from anywhere inside. */}
      <div
        className="flex h-full"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault();
            closeOverlay();
          }
        }}
      >
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 bg-sidebar p-2 pt-4" data-dense>
          <h2 className="mb-2 px-2 text-title-3 font-semibold text-ink">Settings</h2>
          {SECTIONS.map(({ id, title, icon: Icon }) => (
            <button
              type="button"
              key={id}
              data-section={id}
              aria-current={id === section || undefined}
              onClick={() => ui.set({ settingsSection: id })}
              className={`flex h-7 items-center gap-2 rounded-md px-2 text-left text-body transition-colors duration-100 hover:duration-0 ${
                id === section
                  ? "bg-active text-ink [&>svg]:text-accent"
                  : "text-ink hover:bg-hover [&>svg]:text-ink-2"
              }`}
            >
              <Icon size={16} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0" />
              {title}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto px-6 pt-4 pb-6">
          <h2 className="mb-4 text-title-3 font-semibold text-ink">{current?.title}</h2>
          {section === "general" && <GeneralSection />}
          {section === "grid" && <GridSection />}
          {section === "zones" && <ZonesSection />}
          {section === "calendars" && <CalendarsSection />}
          {section === "account" && <AccountSection auth={auth} sync={sync} />}
        </div>
      </div>
    </Overlay>
  );
}
