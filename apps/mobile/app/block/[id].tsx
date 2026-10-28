import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { useApp } from "../../src/lib/app";
import { BlockSheet } from "../../src/sheets/BlockSheet";

// /block/<uuid>, or /block/by-title?title=… for the task's latest block (screenshots).
export default function BlockRoute() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const { data } = useApp();
  const task = id === "by-title" ? data.tasks.find((each) => each.title === title) : undefined;
  const block =
    data.blocks.find((each) => each.uuid === id) ??
    [...data.blocks].reverse().find((each) => task !== undefined && each.task_uuid === task.uuid);
  useEffect(() => {
    if (data.loaded && !block) router.back();
  }, [data.loaded, block]);
  if (!block) return null;
  return <BlockSheet block={block} />;
}
