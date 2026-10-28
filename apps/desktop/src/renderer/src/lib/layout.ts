/*
 * Side-by-side layout for overlapping chips in one day column (research/07 §7.6): up
 * to three concurrent chips share the width; beyond that, later ones cascade to the
 * right so every title stays visible.
 */

export interface Placed {
  id: string;
  start: number;
  end: number;
}

export interface Slot {
  // Fractions of the column width.
  left: number;
  width: number;
  // Stacking order, so cascaded chips sit above the ones they overlap.
  z: number;
}

export function layoutColumn(items: readonly Placed[]) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const slots = new Map<string, Slot>();
  let cluster: { item: Placed; column: number }[] = [];
  let clusterEnd = -1;
  let columnEnds: number[] = [];

  const flush = () => {
    const columns = columnEnds.length;
    for (const { item, column } of cluster) {
      if (columns <= 3) {
        slots.set(item.id, { left: column / columns, width: 1 / columns, z: column });
      } else {
        const left = (column / columns) * 0.6;
        slots.set(item.id, { left, width: 1 - left, z: column });
      }
    }
    cluster = [];
    columnEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= clusterEnd && cluster.length) flush();
    let column = columnEnds.findIndex((end) => end <= item.start);
    if (column === -1) column = columnEnds.push(item.end) - 1;
    else columnEnds[column] = item.end;
    cluster.push({ item, column });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length) flush();
  return slots;
}

// Lanes for all-day and month bars: the first lane whose last item ends before this one.
export function assignLanes<T extends { from: number; to: number }>(items: readonly T[]) {
  const lanes: number[] = [];
  const sorted = [...items].sort((a, b) => a.from - b.from || b.to - a.to);
  return sorted.map((item) => {
    let lane = lanes.findIndex((end) => end < item.from);
    if (lane === -1) lane = lanes.push(item.to) - 1;
    else lanes[lane] = item.to;
    return { item, lane };
  });
}
