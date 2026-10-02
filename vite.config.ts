import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        adventure: resolve(import.meta.dirname, "index.html"),
        race: resolve(import.meta.dirname, "race.html"),
      },
    },
  },
});
