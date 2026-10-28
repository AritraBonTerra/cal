import { useLocalSearchParams } from "expo-router";
import { toListId } from "../src/lib/lists";
import { QuickEntrySheet } from "../src/sheets/QuickEntrySheet";

// /quick-entry?list=today&text=… adds to the list it was opened from (Inbox by default),
// optionally with text already typed (used by the screenshot scenes).
export default function QuickEntryRoute() {
  const { text, list } = useLocalSearchParams<{ text?: string; list?: string }>();
  return <QuickEntrySheet initialText={text ?? ""} list={toListId(list)} />;
}
