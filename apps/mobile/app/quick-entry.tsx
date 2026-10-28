import { useLocalSearchParams } from "expo-router";
import { QuickEntrySheet } from "../src/sheets/QuickEntrySheet";

// /quick-entry?text=… opens with text already typed (used by the screenshot scenes).
export default function QuickEntryRoute() {
  const { text } = useLocalSearchParams<{ text?: string }>();
  return <QuickEntrySheet initialText={text ?? ""} />;
}
