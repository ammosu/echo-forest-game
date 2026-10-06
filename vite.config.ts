import { defineConfig } from "vite";
import { resolve } from "node:path";

// GitHub Pages serves the build under /echo-forest-game/; dev and tests stay at /.
export default defineConfig(({ command, isPreview }) => ({
  base: command === "build" || isPreview ? "/echo-forest-game/" : "/",
  build: {
    rollupOptions: {
      input: {
        forest: resolve(import.meta.dirname, "index.html"),
        adventure: resolve(import.meta.dirname, "adventure.html"),
        // Old map URL kept as a redirect for existing bookmarks.
        forestRedirect: resolve(import.meta.dirname, "forest.html"),
        defense: resolve(import.meta.dirname, "defense.html"),
        race: resolve(import.meta.dirname, "race.html"),
        echo: resolve(import.meta.dirname, "echo.html"),
        catch: resolve(import.meta.dirname, "catch.html"),
        ski: resolve(import.meta.dirname, "ski.html"),
      },
    },
  },
}));
