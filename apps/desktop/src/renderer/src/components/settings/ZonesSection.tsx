import { Plus } from "lucide-react";
import { useNow } from "../../lib/clock";
import { formatMinutes } from "../../lib/time";
import { closeOverlay, openZonePicker } from "../../lib/ui";
import { MAX_EXTRA_ZONES, useZoneSettings } from "../../lib/zoneSettings";
import { deviceZone, zoneAbbreviation, zoneCity, zonedMinutes } from "../../lib/zones";
import { Keycaps } from "../ui";
import { Group, Row, RowButton } from "./controls";

// Time zones: the primary zone the grid renders in, and the extra gutter columns.
export function ZonesSection() {
  const zones = useZoneSettings();
  const now = useNow();
  const describe = (zone: string) =>
    `${zoneAbbreviation(zone, now)} · ${formatMinutes(zonedMinutes(now, zone))}`;
  // The picker is its own overlay, so Settings closes to make room for it.
  const pick = (purpose: Parameters<typeof openZonePicker>[0]) => {
    closeOverlay();
    openZonePicker(purpose);
  };
  return (
    <>
      <Group title="Primary zone">
        <Row
          label={
            zones.primary === deviceZone
              ? `Follow Mac · ${zoneCity(deviceZone)}`
              : zoneCity(zones.primary)
          }
          note={describe(zones.primary)}
        >
          {zones.primary !== deviceZone && (
            <RowButton onClick={() => zones.setPrimary(null)}>Follow Mac</RowButton>
          )}
          <RowButton onClick={() => pick({ kind: "change" })}>Change…</RowButton>
        </Row>
      </Group>
      <Group title={`Extra columns · up to ${MAX_EXTRA_ZONES}`}>
        {zones.extras.map((column, index) => (
          <Row
            key={column.zone}
            label={
              column.label ? `${column.label} · ${zoneCity(column.zone)}` : zoneCity(column.zone)
            }
            note={describe(column.zone)}
          >
            <RowButton onClick={() => pick({ kind: "change", index })}>Change…</RowButton>
            <RowButton onClick={() => zones.makePrimary(column.zone)}>Make primary</RowButton>
            <RowButton onClick={() => zones.remove(index)} danger>
              Remove
            </RowButton>
          </Row>
        ))}
        <Row
          label={zones.extras.length === 0 ? "No extra columns" : ""}
          note={
            zones.extras.length === 0
              ? "Columns sit left of the hour labels; right-click one on the grid to rename it"
              : "Drag column headers on the grid to reorder them"
          }
        >
          <RowButton onClick={() => pick({ kind: "add" })} disabled={zones.full}>
            <span className="flex items-center gap-1">
              <Plus size={12} strokeWidth={2} absoluteStrokeWidth />
              Add time zone
            </span>
          </RowButton>
        </Row>
      </Group>
      <p className="flex items-center gap-1.5 px-1 text-small text-ink-3">
        Press <Keycaps binding="z" /> on the calendar to view it in another zone;{" "}
        <Keycaps binding="escape" /> returns.
      </p>
    </>
  );
}
