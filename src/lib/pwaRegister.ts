// Guarded service-worker registration wrapper.
//
// vite-plugin-pwa is configured with `selfDestroying: true` so *any* SW it
// generates immediately unregisters and clears its Workbox caches on activate.
// That's exactly the kill-switch behaviour we want in production for users who
// still have an old app SW installed – but we must NEVER register (not even a
// self-destroying SW) inside Lovable's editor preview, because the iframe/HMR
// combination causes the preview to stop loading until the user re-authenticates.
//
// This wrapper is the single registrar. `vite.config.ts` sets
// `injectRegister: null` so the plugin never injects its own <script> tag.

const isProd = import.meta.env.PROD;

function isPreviewOrDevHost(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true; // cross-origin frame → treat as preview
  }
  const host = window.location.hostname;
  if (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  ) {
    return true;
  }
  return new URL(window.location.href).searchParams.get("sw") === "off";
}

async function unregisterAppSw(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
          // Only touch our own /sw.js – leave FCM/OneSignal/etc. alone.
          return url.endsWith("/sw.js");
        })
        .map((r) => r.unregister()),
    );
  } catch {
    /* ignore */
  }
}

export function registerAppServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  if (!isProd || isPreviewOrDevHost()) {
    // Never register in dev or Lovable preview – and if a previous build did,
    // clear it out so the iframe can hydrate cleanly.
    void unregisterAppSw();
    return;
  }

  // Production, non-preview → let vite-plugin-pwa's generated (self-destroying)
  // worker run so returning users get evicted.
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {
      /* ignore – no worker registered means nothing to clean up */
    });
}
