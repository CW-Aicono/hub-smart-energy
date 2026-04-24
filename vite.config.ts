import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { stripCspMetaPlugin } from "./build/vite-plugin-strip-csp";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // Emergency recovery: force old service workers/caches to unregister.
      // This prevents stale bundles (e.g. old 3D viewer code) from being served.
      selfDestroying: true,
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "icon-192.png", "icon-512.png"],
      manifest: false, // We use our own manifest.json in public/
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallbackDenylist: [/^\/~oauth/],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    stripCspMetaPlugin(),
  ].filter(Boolean),

  // IMPORTANT: Ensure Vite rebuilds and uses the React-18 compatible builds.
  optimizeDeps: {
    include: ["react-leaflet", "@react-leaflet/core", "leaflet"],
    force: true,
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          translations: ["./src/i18n/translations.ts"],
          leaflet: ["leaflet", "react-leaflet", "@react-leaflet/core"],
          recharts: ["recharts"],
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          xlsx: ["@e965/xlsx"],
          "date-fns": ["date-fns"],
        },
      },
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
