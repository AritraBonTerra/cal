import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { useApp } from "../../src/lib/app";
import { TaskSheet } from "../../src/sheets/TaskSheet";

/*
 * /task/<uuid>?section=when opens the sheet with the When picker expanded. Fixture
 * ids are random, so screenshot scenes use /task/by-title?title=… instead.
 */
export default function TaskRoute() {
  const { id, section, title } = useLocalSearchParams<{
    id: string;
    section?: string;
    title?: string;
  }>();
  const { data } = useApp();
  const task =
    data.tasks.find((each) => each.uuid === id) ??
    (id === "by-title" ? data.tasks.find((each) => each.title === title) : undefined);
  // The task was deleted (here or on another device): close the sheet.
  useEffect(() => {
    if (data.loaded && !task) router.back();
  }, [data.loaded, task]);
  if (!task) return null;
  return (
    <TaskSheet
      task={task}
      section={section === "when" || section === "deadline" ? section : undefined}
    />
  );
}
