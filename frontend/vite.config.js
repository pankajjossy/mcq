import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative paths so the build works under GitHub Pages' /repo-name/
  // subpath without hardcoding the repo name here.
  base: "./"
});
