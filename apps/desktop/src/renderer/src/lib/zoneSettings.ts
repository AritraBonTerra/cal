import { useSettings, type ZoneColumn } from "@cal/app-core";
import { ui } from "./ui";
import { deviceZone } from "./zones";

// How many extra columns the gutter holds (four zones in all, like Notion).
export const MAX_EXTRA_ZONES = 3;

/**
 * Edits to the account's time-zone columns and primary zone. Columns are stored
 * outermost first, so the last one sits next to the main gutter. Every edit also
 * records the zone as recently used for the picker.
 */
export function useZoneSettings() {
  const { account, device, setAccount, setDevice } = useSettings();
  const extras = account.timeZones;
  const primary = account.primaryZone ?? deviceZone;

  const save = (columns: readonly ZoneColumn[]) =>
    setAccount("timeZones", columns.slice(-MAX_EXTRA_ZONES));
  const remember = (zone: string) =>
    setDevice(
      "recentZones",
      [zone, ...device.recentZones.filter((each) => each !== zone)].slice(0, 6),
    );

  return {
    extras,
    primary,
    full: extras.length >= MAX_EXTRA_ZONES,
    // Adds a column next to the main gutter; a zone already shown is left alone.
    add(zone: string) {
      remember(zone);
      if (zone === primary || extras.some((column) => column.zone === zone)) return;
      void save([...extras, { zone }]);
    },
    remove(index: number) {
      void save(extras.filter((_, each) => each !== index));
    },
    rename(index: number, label: string) {
      void save(
        extras.map((column, each) =>
          each === index ? { zone: column.zone, ...(label ? { label } : {}) } : column,
        ),
      );
    },
    change(index: number, zone: string) {
      remember(zone);
      void save(extras.map((column, each) => (each === index ? { zone } : column)));
    },
    // Moves column `from` to sit at `to` among the extras.
    reorder(from: number, to: number) {
      const columns = [...extras];
      const [moved] = columns.splice(from, 1);
      if (!moved) return;
      columns.splice(to, 0, moved);
      void save(columns);
    },
    // Puts `zone` beside the grid; the zone it replaces becomes the innermost column.
    makePrimary(zone: string) {
      remember(zone);
      const rest = extras.filter((column) => column.zone !== zone);
      void save([...rest, { zone: primary }]);
      void setAccount("primaryZone", zone === deviceZone ? null : zone);
      ui.set({ travelZone: null });
    },
    // Sets the primary outright (Settings): null follows the Mac again.
    setPrimary(zone: string | null) {
      if (zone) remember(zone);
      void setAccount("primaryZone", zone === deviceZone ? null : zone);
      void save(extras.filter((column) => column.zone !== (zone ?? deviceZone)));
    },
    travel(zone: string) {
      remember(zone);
      ui.set({ travelZone: zone === primary ? null : zone });
    },
  };
}
