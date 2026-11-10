/*
 * The letters inside compact habit rings: each habit's initial, or the shortest prefix
 * (at most two characters) that tells it apart from the other habits shown. Spaces are
 * skipped and characters are whole graphemes, so an emoji title shows its emoji.
 */

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// "Morning run" → ["M", "o", "r", …]
const charsOf = (title: string) =>
  Array.from(graphemes.segment(title.replace(/\s+/g, "")), (part) => part.segment);

// The ring label per title, in the same order.
export function ringLabels(titles: readonly string[]) {
  const chars = titles.map(charsOf);
  const prefix = (index: number, length: number) =>
    (chars[index] ?? []).slice(0, length).join("").toLocaleLowerCase();
  return chars.map((own, index) => {
    const clash = chars.some(
      (_, other) => other !== index && prefix(other, 1) === prefix(index, 1),
    );
    const label = own.slice(0, clash ? 2 : 1);
    const [first = "", ...rest] = label;
    return first.toLocaleUpperCase() + rest.join("").toLocaleLowerCase();
  });
}
