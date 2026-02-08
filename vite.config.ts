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

  // Prevent Vite from pre-bundling Leaflet packages into node_modules/.vite/deps.
  // The prebundle cache can get stuck on a React-19 build (renderable context + use()),
  // which crashes React 18 at runtime with `render2 is not a function`.
  optimizeDeps: {
    exclude: ["react-leaflet", "@react-leaflet/core", "leaflet"],
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Ensure we never bundle multiple copies of React.
    dedupe: ["react", "react-dom"],
  },
}));
