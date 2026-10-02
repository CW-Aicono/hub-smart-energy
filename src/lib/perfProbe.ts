// PERF-PROBE – remove after diagnosis
// Small helper for one-off performance markers we can read from the browser
// console. Guards itself so it stays a no-op in production builds.

const enabled =
  typeof window !== "undefined" &&
  typeof performance !== "undefined" &&
  import.meta.env.DEV;

const t0 = enabled ? performance.now() : 0;
const seenOnce = new Set<string>();

export function probeMark(label: string, opts?: { once?: boolean }) {
  if (!enabled) return;
  if (opts?.once) {
    if (seenOnce.has(label)) return;
    seenOnce.add(label);
  }
  const dt = performance.now() - t0;
  // eslint-disable-next-line no-console
  console.info(`[perf-probe] +${dt.toFixed(0)}ms  ${label}`);
}

const timers = new Map<string, number>();
export function probeStart(label: string) {
  if (!enabled) return;
  timers.set(label, performance.now());
}
export function probeEnd(label: string) {
  if (!enabled) return;
  const start = timers.get(label);
  if (start === undefined) return;
  timers.delete(label);
  const dur = performance.now() - start;
  // eslint-disable-next-line no-console
  console.info(`[perf-probe] ${label}: ${dur.toFixed(0)}ms`);
}

// One-shot environment snapshot – helps us see whether an old SW is
// hijacking the Lovable preview iframe.
export function probeEnvOnce() {
  if (!enabled) return;
  if (seenOnce.has("__env__")) return;
  seenOnce.add("__env__");
  try {
    const inIframe = window.self !== window.top;
    const info: Record<string, unknown> = {
      href: window.location.href,
      inIframe,
      host: window.location.hostname,
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        // eslint-disable-next-line no-console
        console.info("[perf-probe] env", {
          ...info,
          serviceWorkers: regs.map((r) => ({
            scope: r.scope,
            active: r.active?.scriptURL ?? null,
            waiting: r.waiting?.scriptURL ?? null,
          })),
          controller: navigator.serviceWorker.controller?.scriptURL ?? null,
        });
      });
    } else {
      // eslint-disable-next-line no-console
      console.info("[perf-probe] env", info);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.info("[perf-probe] env error", e);
  }
}
