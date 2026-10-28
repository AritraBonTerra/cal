import { useTable } from "@cal/app-core";

// Placeholder shell until the calendar and task views land.
export function App() {
  const { rows, loaded } = useTable("tasks");
  return (
    <main className="p-8 font-sans text-sm" data-ready={loaded || undefined}>
      <h1 className="font-semibold">Cal</h1>
      <p>{loaded ? `${rows.length} tasks` : "Loading…"}</p>
    </main>
  );
}
