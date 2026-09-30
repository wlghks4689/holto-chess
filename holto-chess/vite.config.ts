import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// Two pages: the game (index.html) and the admin inbox (admin.html, served by the Worker on admin.porena.kr).
// Scoped to the client environment; the Worker environment keeps its own entry.
export default defineConfig({
  plugins: [react(), cloudflare()],
  environments: { client: { build: { rollupOptions: { input: { index: "index.html", admin: "admin.html" } } } } },
});
