import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "/echo-forest-game/",
  build: {
    rollupOptions: {
      input: {
        adventure: resolve(import.meta.dirname, "index.html"),
        defense: resolve(import.meta.dirname, "defense.html"),
        race: resolve(import.meta.dirname, "race.html"),
      },
    },
  },
});
