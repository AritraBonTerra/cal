import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  // Everything is bundled (workspace packages ship TypeScript source, and convex is
  // plain JS), so the packaged app carries no node_modules.
  main: {
    build: { externalizeDeps: false },
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
