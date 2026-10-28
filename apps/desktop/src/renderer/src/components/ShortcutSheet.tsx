import { searchCommands, useCommandList } from "@cal/app-core";
import { useState } from "react";
import { closeOverlay } from "../lib/ui";
import { Keycaps, Overlay } from "./ui";

const GROUP_ORDER = ["View", "Navigate", "To-Do", "Calendar", "General"];

// `?`: every shortcut, grouped and searchable (from Vimcal).
export function ShortcutSheet() {
  const commands = useCommandList(true);
  const [query, setQuery] = useState("");
  const bound = searchCommands(commands, query).filter((command) => command.keys?.length);
  const groups = GROUP_ORDER.map((group) => ({
    group,
    commands: bound.filter((command) => command.group === group),
  })).filter((entry) => entry.commands.length > 0);

  return (
    <Overlay onClose={closeOverlay} width={720} label="Keyboard shortcuts">
      <div className="flex h-11 items-center gap-3 border-b border-grid px-4">
        <h2 className="text-title-3 font-semibold text-ink">Keyboard shortcuts</h2>
        <input
          // biome-ignore lint/a11y/noAutofocus: the sheet is a search.
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "?") {
              event.preventDefault();
              closeOverlay();
            }
          }}
          placeholder="Search…"
          aria-label="Search shortcuts"
          className="ml-auto h-7 w-48 rounded-md bg-hover px-2 text-body text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      <div className="grid max-h-[calc(70vh-44px)] grid-cols-2 gap-x-8 gap-y-4 overflow-y-auto p-5">
        {groups.map(({ group, commands: list }) => (
          <section key={group} className="break-inside-avoid">
            <h3 className="mb-1 text-caption font-medium text-ink-3">{group}</h3>
            <ul>
              {list.map((command) => (
                <li key={command.id} className="flex h-7 items-center gap-3 text-body text-ink">
                  <span className="flex-1 truncate">{command.title}</span>
                  <span className="flex items-center gap-1.5">
                    {command.keys?.map((binding, index) => (
                      <span key={binding} className="flex items-center gap-1.5">
                        {index > 0 && <span className="text-caption text-ink-3">or</span>}
                        <Keycaps binding={binding} />
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 && (
          <div className="col-span-2 py-6 text-center text-small text-ink-3">
            No matching shortcuts
          </div>
        )}
      </div>
    </Overlay>
  );
}
