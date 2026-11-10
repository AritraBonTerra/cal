/*
 * Tags on a to-do are stored as one comma-joined string ("admin,deep"), since synced
 * rows hold no arrays. The card types them as names separated by commas or spaces,
 * with or without "#", and rows show them as "#admin #deep".
 */

// The tag names in a stored `tags` value, in order.
export const tagNames = (tags: string | undefined) =>
  (tags ?? "").split(",").filter((name) => name !== "");

// The stored value for typed tags: names without "#", duplicates dropped, "" for none.
export function parseTags(text: string) {
  const names = text
    .split(/[\s,]+/)
    .map((name) => name.replace(/^#+/, ""))
    .filter((name) => name !== "");
  return [...new Set(names)].join(",");
}
