import type { ConfigContext, ExpoConfig } from "expo/config";

/*
 * app.json plus what CI stamps on a release build (.github/workflows/release.yml):
 * CAL_VERSION is the version the Mac app ships as too, CAL_BUILD the increasing build
 * number TestFlight needs. Local builds keep app.json's values.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? "Cal",
  slug: config.slug ?? "cal",
  version: process.env.CAL_VERSION ?? config.version,
  ios: { ...config.ios, buildNumber: process.env.CAL_BUILD ?? config.ios?.buildNumber },
});
