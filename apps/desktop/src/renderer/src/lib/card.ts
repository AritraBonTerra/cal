import { type Actions, useActions } from "@cal/app-core";
import type { Task } from "@cal/domain";
import type { RowPatch } from "@cal/sync";
import { useEffect, useRef } from "react";
import { useApp } from "./app";
import { type CardParseContext, parseCardTitle } from "./cardEntry";
import { now } from "./clock";
import type { Literal } from "./entryText";
import { createStore, useStore } from "./store";
import { select, ui } from "./ui";

/*
 * A to-do opened into a card (Return, double-click, ⌘N). `ui.editing` names the open
 * card; its title and notes are drafts kept here rather than in the card, so whoever
 * closes it (Escape, a click elsewhere, another selection, switching lists) saves them:
 * `useCardSaver` watches `ui.editing` and saves the card that just closed. A card ⌘N
 * opened on a new to-do reads its title as Quick Entry text; on close, the clean title
 * and the fields it names are written together.
 */

interface CardText {
  uuid: string | null;
  title: string;
  notes: string;
  // What's already saved, so a blur followed by a close saves once.
  saved: { title: string; notes: string };
  // A new to-do's card (⌘N): its title is parsed, and saved only when the card closes.
  isNew: boolean;
  // Spans of a new card's title the user un-parsed; they stay title text.
  literals: Literal[];
}

const CLOSED: CardText = {
  uuid: null,
  title: "",
  notes: "",
  saved: { title: "", notes: "" },
  isNew: false,
  literals: [],
};

export const cardText = createStore<CardText>(CLOSED);

export const useCardText = <R>(select: (state: CardText) => R) => useStore(cardText, select);

// Opens `task` as a card, selected, saving any other card first. `isNew` marks a to-do
// just made by ⌘N, whose title is read as Quick Entry text.
export function openCard(task: Pick<Task, "uuid" | "title" | "notes">, isNew = false) {
  closeCard();
  const text = { title: task.title, notes: task.notes ?? "" };
  cardText.set({ uuid: task.uuid, ...text, saved: text, isNew, literals: [] });
  ui.set({ selection: { kind: "task", uuid: task.uuid }, editing: task.uuid, tasks: true });
}

// Closes the open card and keeps its row selected; `useCardSaver` saves it.
export const closeCard = () => ui.set({ editing: null });

// Saves the open card's title and notes where they changed, resolving once written. An
// empty title is never saved: a to-do keeps its old title until it gets a new one. A new
// card's title waits for the close (`finishCard`), which writes it with its parse.
export async function saveCardText(actions: Actions, withTitle = !cardText.get().isNew) {
  const { uuid, title, notes, saved } = cardText.get();
  if (!uuid) return;
  const patch: RowPatch<"tasks"> = {};
  const nextTitle = title.trim();
  if (withTitle && nextTitle && nextTitle !== saved.title) patch.title = nextTitle;
  Object.assign(patch, notesPatch(notes, saved.notes));
  if (Object.keys(patch).length === 0) return;
  cardText.set({ saved: { title: patch.title ?? saved.title, notes: notes.trimEnd() } });
  await actions.updateTask(uuid, patch);
}

// The notes change from `saved` to `notes`, if any; trailing blank lines don't count.
function notesPatch(notes: string, saved: string): RowPatch<"tasks"> {
  const next = notes.trimEnd();
  return next === saved ? {} : { notes: next || null };
}

// Saves a card that just closed. A to-do closed with neither a title nor notes is removed,
// as an empty new to-do always was; one with only notes is kept. A new to-do's parse is
// applied with its notes as one step, unless its text was only tokens ("tomorrow"):
// then the text itself becomes the title and nothing is applied.
async function finishCard(actions: Actions, context: CardParseContext) {
  const { uuid, title, notes, saved, isNew, literals } = cardText.get();
  if (!uuid) return;
  if (!title.trim() && !saved.title && !notes.trim()) {
    cardText.set(CLOSED);
    const { selection } = ui.get();
    if (selection?.kind === "task" && selection.uuid === uuid) select(null);
    await actions.deleteTask(uuid);
    return;
  }
  if (isNew) {
    const entry = parseCardTitle(title, literals, context, now());
    if (entry.title.trim()) {
      cardText.set(CLOSED);
      await actions.applyEntry(uuid, entry, notesPatch(notes, saved.notes));
      return;
    }
  }
  const written = saveCardText(actions, true);
  cardText.set(CLOSED);
  await written;
}

// Mounted once (by the to-do pane): saves each card as it closes, however it closed. A
// window that is closing, or an app that is quitting, waits for the open card's save.
export function useCardSaver() {
  const actions = useActions();
  const { data, account, zone } = useApp();
  // What a new card's parse needs, read when it closes.
  const context = useRef<CardParseContext>({ projects: [], weekStartsOn: 1, timeZone: zone });
  context.current = { projects: data.projects, weekStartsOn: account.weekStart, timeZone: zone };
  useEffect(() => {
    let open = ui.get().editing;
    const stop = ui.subscribe(() => {
      const next = ui.get().editing;
      if (next === open) return;
      open = next;
      if (cardText.get().uuid !== next) void finishCard(actions, context.current);
    });
    const stopClosing = window.cal.onClosing(() => finishCard(actions, context.current));
    return () => {
      stop();
      stopClosing();
    };
  }, [actions]);
}
