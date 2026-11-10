import { type Actions, useActions } from "@cal/app-core";
import type { Task } from "@cal/domain";
import type { RowPatch } from "@cal/sync";
import { useEffect } from "react";
import { createStore, useStore } from "./store";
import { select, ui } from "./ui";

/*
 * A to-do opened into a card (Return, double-click, ⌘N). `ui.editing` names the open
 * card; its title and notes are drafts kept here rather than in the card, so whoever
 * closes it (Escape, a click elsewhere, another selection, switching lists) saves them:
 * `useCardSaver` watches `ui.editing` and saves the card that just closed.
 */

interface CardText {
  uuid: string | null;
  title: string;
  notes: string;
  // What's already saved, so a blur followed by a close saves once.
  saved: { title: string; notes: string };
}

const CLOSED: CardText = { uuid: null, title: "", notes: "", saved: { title: "", notes: "" } };

export const cardText = createStore<CardText>(CLOSED);

export const useCardText = <R>(select: (state: CardText) => R) => useStore(cardText, select);

// Opens `task` as a card, selected, saving any other card first.
export function openCard(task: Pick<Task, "uuid" | "title" | "notes">) {
  closeCard();
  const text = { title: task.title, notes: task.notes ?? "" };
  cardText.set({ uuid: task.uuid, ...text, saved: text });
  ui.set({ selection: { kind: "task", uuid: task.uuid }, editing: task.uuid, tasks: true });
}

// Closes the open card and keeps its row selected; `useCardSaver` saves it.
export const closeCard = () => ui.set({ editing: null });

// Saves the open card's title and notes where they changed. An empty title is never
// saved: a to-do keeps its old title until it gets a new one.
export function saveCardText(actions: Actions) {
  const { uuid, title, notes, saved } = cardText.get();
  if (!uuid) return;
  const patch: RowPatch<"tasks"> = {};
  const nextTitle = title.trim();
  const nextNotes = notes.trimEnd();
  if (nextTitle && nextTitle !== saved.title) patch.title = nextTitle;
  if (nextNotes !== saved.notes) patch.notes = nextNotes || null;
  if (Object.keys(patch).length === 0) return;
  cardText.set({ saved: { title: patch.title ?? saved.title, notes: nextNotes } });
  void actions.updateTask(uuid, patch);
}

// Saves a card that just closed. A new to-do closed with no title is removed, as before.
function finishCard(actions: Actions) {
  const { uuid, title, saved } = cardText.get();
  if (!uuid) return;
  if (!title.trim() && !saved.title) {
    cardText.set(CLOSED);
    const { selection } = ui.get();
    if (selection?.kind === "task" && selection.uuid === uuid) select(null);
    void actions.deleteTask(uuid);
    return;
  }
  saveCardText(actions);
  cardText.set(CLOSED);
}

// Mounted once (by the to-do pane): saves each card as it closes, however it closed.
export function useCardSaver() {
  const actions = useActions();
  useEffect(() => {
    let open = ui.get().editing;
    return ui.subscribe(() => {
      const next = ui.get().editing;
      if (next === open) return;
      open = next;
      if (cardText.get().uuid !== next) finishCard(actions);
    });
  }, [actions]);
}
