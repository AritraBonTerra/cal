/*
 * Where "Open in Maps" goes. Both are https links: the main process hands them to the
 * browser, which opens Apple Maps for maps.apple.com on a Mac.
 */
export function mapsUrl(location: string, app: "apple" | "google") {
  const query = encodeURIComponent(location.trim());
  return app === "google"
    ? `https://www.google.com/maps/search/?api=1&query=${query}`
    : `https://maps.apple.com/?q=${query}`;
}

export const mapsLabel = (app: "apple" | "google") =>
  app === "google" ? "Open in Google Maps" : "Open in Apple Maps";
