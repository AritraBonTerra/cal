import { useWindowDimensions } from "react-native";

/*
 * iPad-class windows get the split view; narrower ones (iPhone in either orientation,
 * Slide Over, a narrow Stage Manager window) get tabs. The shorter side decides, so a
 * landscape phone never shows three panes.
 */
export const SPLIT_MIN_SIDE = 700;

export function useIsWide() {
  const { width, height } = useWindowDimensions();
  return Math.min(width, height) >= SPLIT_MIN_SIDE;
}
