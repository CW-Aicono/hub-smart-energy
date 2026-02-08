import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),

  // IMPORTANT: Ensure Vite rebuilds and uses the React-18 compatible builds.
  // A stale optimizeDeps cache can bundle a React-19 build of @react-leaflet/core
  // (renderable context / use()) which results in a white map and missing tiles.
  optimizeDeps: {
    include: ["react-leaflet", "@react-leaflet/core", "leaflet"],
    force: true,
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
