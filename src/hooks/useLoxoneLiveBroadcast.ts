import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildLoxoneResolver, type ResolverMeter } from "@/lib/loxoneUuidResolver";

export type LiveRole = "pwr" | "today" | "total" | "month" | "year" | "soc";

export interface LiveBroadcastEvent {
  uuid: string;
  value: number;
  at?: string;
  role?: LiveRole;
}

export interface LoxoneLiveTotals {
  today?: number;
  month?: number;
  year?: number;
  total?: number;
}

export interface LoxoneLiveState {
  /** Momentanleistung je Meter-ID (kW, Vorzeichen erhalten). */
  pwrByMeter: Record<string, number>;
  /** Ladezustand je Meter-ID (%). */
  socByMeter: Record<string, number>;
  /** Zähler-/Periodensummen je Meter-ID. */
  totalsByMeter: Record<string, LoxoneLiveTotals>;
  /** Zeitpunkt des letzten Broadcast-Wertes je Meter-ID (ms seit Epoche). */
  updatedAtByMeter: Record<string, number>;
}

const EMPTY: LoxoneLiveState = {
  pwrByMeter: {},
  socByMeter: {},
  totalsByMeter: {},
  updatedAtByMeter: {},
};

const COALESCE_MS = 1500;
const MAX_BACKOFF_MS = 30_000;

/**
 * Abonniert den Loxone-Live-Broadcast (`loxone-live-<tenant_id>`) für die
 * übergebenen Zähler.
 *
 * - UUID-Auflösung über `buildLoxoneResolver` (Exact-Match + Family/Nearest),
 *   weil der Worker State-UUIDs sendet, `meters.sensor_uuid` aber Block-UUIDs hält.
 * - Coalescing: höchstens alle 1,5 s ein State-Update; im Hintergrund-Tab keins.
 * - Automatischer Neuaufbau bei TIMED_OUT / CHANNEL_ERROR / CLOSED (Backoff).
 */
export function useLoxoneLiveBroadcast(meters: ResolverMeter[]): LoxoneLiveState {
  const [state, setState] = useState<LoxoneLiveState>(EMPTY);

  const resolver = useMemo(() => buildLoxoneResolver(meters), [meters]);
  const resolverRef = useRef(resolver);
  resolverRef.current = resolver;

  const tenantIds = useMemo(
    () => Array.from(new Set(meters.map((m) => m.tenant_id).filter(Boolean))).sort() as string[],
    [meters],
  );
  const tenantKey = tenantIds.join(",");
  // Stabile Signatur der bekannten UUIDs – verhindert Re-Subscribe bei jedem Render.
  const uuidKey = useMemo(
    () =>
      meters
        .map((m) => m.sensor_uuid)
        .filter(Boolean)
        .sort()
        .join(","),
    [meters],
  );

  useEffect(() => {
    if (tenantIds.length === 0 || uuidKey.length === 0) return;

    let disposed = false;
    let buffer: Array<{ ev: LiveBroadcastEvent; tenantId: string }> = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const attempts = new Map<string, number>();
    const channels = new Map<string, ReturnType<typeof supabase.channel>>();

    const flushBuffer = () => {
      flushTimer = null;
      const items = buffer;
      buffer = [];
      if (items.length === 0) return;

      setState((prev) => {
        const pwr = { ...prev.pwrByMeter };
        const soc = { ...prev.socByMeter };
        const totals = { ...prev.totalsByMeter };
        const updated = { ...prev.updatedAtByMeter };
        let changed = false;

        for (const { ev, tenantId } of items) {
          const role: LiveRole = ev.role ?? "pwr";
          const value = Number(ev.value);
          if (!Number.isFinite(value)) continue;
          const at = ev.at ? Date.parse(ev.at) : Date.now();
          const ts = Number.isFinite(at) ? at : Date.now();
          const uuid = String(ev.uuid ?? "");
          if (!uuid) continue;

          if (role === "soc") {
            if (value < 0 || value > 100) continue;
            const meter = resolverRef.current.exactByUuid.get(uuid.toLowerCase());
            if (!meter) continue;
            if (soc[meter.id] !== value) {
              soc[meter.id] = value;
              changed = true;
            }
            updated[meter.id] = ts;
            continue;
          }

          const limit = role === "pwr" ? 10_000 : 10_000_000;
          if (Math.abs(value) > limit) continue;
          const meterId = resolverRef.current.resolve(uuid, tenantId, value);
          if (!meterId) continue;

          if (role === "pwr") {
            if (pwr[meterId] !== value) {
              pwr[meterId] = value;
              changed = true;
            }
            updated[meterId] = ts;
            continue;
          }

          const existing = totals[meterId] ?? {};
          const key = role === "total" ? "total" : role;
          if ((existing as Record<string, number | undefined>)[key] === value) continue;
          totals[meterId] = { ...existing, [key]: value };
          updated[meterId] = ts;
          changed = true;
        }

        if (!changed) return prev;
        return { pwrByMeter: pwr, socByMeter: soc, totalsByMeter: totals, updatedAtByMeter: updated };
      });
    };

    const subscribe = (tenantId: string) => {
      if (disposed) return;
      const name = `loxone-live-${tenantId}`;
      const ch = supabase
        .channel(name, { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "readings" }, (msg: { payload?: { events?: LiveBroadcastEvent[] } }) => {
          const events = msg?.payload?.events ?? [];
          if (events.length === 0) return;
          if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
          for (const ev of events) buffer.push({ ev, tenantId });
          if (!flushTimer) flushTimer = setTimeout(flushBuffer, COALESCE_MS);
        })
        .subscribe((status) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            attempts.set(tenantId, 0);
            return;
          }
          if (status === "TIMED_OUT" || status === "CHANNEL_ERROR" || status === "CLOSED") {
            const n = (attempts.get(tenantId) ?? 0) + 1;
            attempts.set(tenantId, n);
            const delay = Math.min(2000 * 2 ** (n - 1), MAX_BACKOFF_MS);
            const old = channels.get(tenantId);
            if (old) {
              channels.delete(tenantId);
              supabase.removeChannel(old);
            }
            const existingTimer = retryTimers.get(tenantId);
            if (existingTimer) clearTimeout(existingTimer);
            retryTimers.set(
              tenantId,
              setTimeout(() => {
                retryTimers.delete(tenantId);
                subscribe(tenantId);
              }, delay),
            );
          }
        });
      channels.set(tenantId, ch);
    };

    tenantIds.forEach(subscribe);

    return () => {
      disposed = true;
      if (flushTimer) clearTimeout(flushTimer);
      retryTimers.forEach((tm) => clearTimeout(tm));
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantKey, uuidKey]);

  return state;
}
