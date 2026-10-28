import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

// Workspace packages ship TypeScript source, so they're bundled rather than required.
const bundled = [
  "@cal/app-core",
  "@cal/backend",
  "@cal/calendar-source",
  "@cal/domain",
  "@cal/fixtures",
  "@cal/sync",
];

export default defineConfig({
  main: {
    build: { externalizeDeps: { exclude: bundled } },
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
  },
});
