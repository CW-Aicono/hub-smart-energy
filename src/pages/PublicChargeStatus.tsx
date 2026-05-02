import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Zap,
  PlugZap,
  AlertTriangle,
  WifiOff,
  ZapOff,
  Settings,
  HelpCircle,
  Filter,
} from "lucide-react";

interface ChargePoint {
  id: string;
  name: string;
  ocpp_id: string;
  status: string;
  connector_count: number;
  ws_connected: boolean;
  last_heartbeat: string | null;
}

interface Connector {
  charge_point_id: string;
  connector_id: number;
  status: string;
  name: string | null;
  display_order: number;
  connector_type: string;
}

interface ApiResponse {
  tenant: { name: string; logo_url: string | null };
  charge_points: ChargePoint[];
  connectors: Connector[];
  generated_at: string;
}

type StatusKey = "available" | "charging" | "faulted" | "offline" | "unavailable" | "unconfigured";

const STATUS_META: Record<StatusKey, { label: string; bg: string; icon: typeof Zap; iconClass: string }> = {
  available:    { label: "Available",     bg: "bg-emerald-600 text-white",                icon: Zap,         iconClass: "text-emerald-100" },
  charging:     { label: "Charging",      bg: "bg-blue-600 text-white",                   icon: PlugZap,     iconClass: "text-blue-100" },
  faulted:      { label: "Error",         bg: "bg-red-600 text-white",                    icon: AlertTriangle, iconClass: "text-red-100" },
  offline:      { label: "Disconnected",  bg: "bg-slate-500 text-white",                  icon: WifiOff,     iconClass: "text-slate-100" },
  unavailable:  { label: "Unavailable",   bg: "bg-amber-500 text-white",                  icon: ZapOff,      iconClass: "text-amber-100" },
  unconfigured: { label: "Unconfigured",  bg: "bg-purple-500 text-white",                 icon: Settings,    iconClass: "text-purple-100" },
};

function normalizeStatus(cp: ChargePoint, connStatus?: string): StatusKey {
  if (!cp.ws_connected) return "offline";
  const s = (connStatus ?? cp.status ?? "").toLowerCase();
  if (s.includes("charg")) return "charging";
  if (s.includes("fault") || s.includes("error")) return "faulted";
  if (s.includes("unavailable") || s.includes("inoperative")) return "unavailable";
  if (s.includes("unconfigured") || s === "" ) return "unconfigured";
  if (s.includes("avail") || s.includes("preparing") || s.includes("finishing") || s.includes("suspended")) return "available";
  return "available";
}

interface CardData {
  key: string;
  name: string;
  ocppId: string;
  status: StatusKey;
}

export default function PublicChargeStatus() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusKey | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) return;
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-charge-status?token=${encodeURIComponent(token)}`;
        const res = await fetch(url, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        });
        if (!res.ok) {
          if (!cancelled) setError("not_found");
          return;
        }
        const json = (await res.json()) as ApiResponse;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("network");
      }
    }
    load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  const cards: CardData[] = useMemo(() => {
    if (!data) return [];
    const result: CardData[] = [];
    for (const cp of data.charge_points) {
      const conns = data.connectors
        .filter((c) => c.charge_point_id === cp.id)
        .sort((a, b) => a.display_order - b.display_order || a.connector_id - b.connector_id);
      if (conns.length <= 1) {
        result.push({
          key: cp.id,
          name: cp.name,
          ocppId: cp.ocpp_id,
          status: normalizeStatus(cp, conns[0]?.status),
        });
      } else {
        for (const c of conns) {
          const suffix = c.name?.trim() || `Connector ${c.connector_id}`;
          result.push({
            key: `${cp.id}-${c.connector_id}`,
            name: `${cp.name}\n${suffix}`,
            ocppId: cp.ocpp_id,
            status: normalizeStatus(cp, c.status),
          });
        }
      }
    }
    return result;
  }, [data]);

  const counters = useMemo(() => {
    const c: Record<StatusKey, number> = {
      available: 0,
      charging: 0,
      faulted: 0,
      offline: 0,
      unavailable: 0,
      unconfigured: 0,
    };
    for (const card of cards) c[card.status]++;
    return c;
  }, [cards]);

  const filteredCards = filter ? cards.filter((c) => c.status === filter) : cards;

  if (error === "not_found") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Link nicht verfügbar</h1>
          <p className="text-slate-600">
            Dieser öffentliche Statuslink existiert nicht oder wurde deaktiviert.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {data.tenant.logo_url ? (
              <img src={data.tenant.logo_url} alt={data.tenant.name} className="h-8 w-8 object-contain" />
            ) : (
              <div className="h-8 w-8 rounded bg-slate-800 flex items-center justify-center text-white font-bold text-xs">
                {data.tenant.name?.[0] ?? "?"}
              </div>
            )}
            <h1 className="text-lg font-semibold text-slate-900">{data.tenant.name}</h1>
            <span className="inline-flex items-center gap-1.5 ml-2 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Real-time
            </span>
            <button
              onClick={() => setFilterOpen((o) => !o)}
              className="ml-2 inline-flex items-center gap-1.5 px-3 py-1 rounded border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Filter className="h-3.5 w-3.5" />
              Filter {filter ? `(1)` : ""}
            </button>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Counter icon={Zap} color="text-emerald-600" value={counters.available} active={filter === "available"} onClick={() => setFilter(filter === "available" ? null : "available")} />
            <Counter icon={PlugZap} color="text-blue-600" value={counters.charging} active={filter === "charging"} onClick={() => setFilter(filter === "charging" ? null : "charging")} />
            <Counter icon={AlertTriangle} color="text-red-600" value={counters.faulted} active={filter === "faulted"} onClick={() => setFilter(filter === "faulted" ? null : "faulted")} />
            <Counter icon={WifiOff} color="text-slate-500" value={counters.offline} active={filter === "offline"} onClick={() => setFilter(filter === "offline" ? null : "offline")} />
            <Counter icon={ZapOff} color="text-amber-500" value={counters.unavailable} active={filter === "unavailable"} onClick={() => setFilter(filter === "unavailable" ? null : "unavailable")} />
            <Counter icon={Settings} color="text-purple-500" value={counters.unconfigured} active={filter === "unconfigured"} onClick={() => setFilter(filter === "unconfigured" ? null : "unconfigured")} />
            <Counter icon={HelpCircle} color="text-slate-400" value={0} />
          </div>
        </div>
        {filterOpen && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
            Klicken Sie auf einen Status oben, um nach diesem zu filtern.
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {filteredCards.length === 0 ? (
          <div className="text-center text-slate-500 py-16">Keine Ladepunkte vorhanden.</div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredCards.map((card) => {
              const meta = STATUS_META[card.status];
              const Icon = meta.icon;
              return (
                <div
                  key={card.key}
                  className={`rounded-lg p-4 ${meta.bg} shadow-sm`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium opacity-95">
                    <Icon className={`h-3.5 w-3.5 ${meta.iconClass}`} />
                    {meta.label}
                  </div>
                  <div className="mt-3 font-semibold leading-tight">{card.name}</div>
                  <div className="mt-3 text-xs opacity-80 font-mono">#{card.ocppId}</div>
                </div>
              );
            })}
          </div>
        )}
        <div className="text-center text-xs text-slate-400 mt-8">
          Aktualisiert: {new Date(data.generated_at).toLocaleTimeString("de-DE")}
        </div>
      </main>
    </div>
  );
}

function Counter({
  icon: Icon,
  color,
  value,
  active,
  onClick,
}: {
  icon: typeof Zap;
  color: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`inline-flex items-center gap-1.5 ${active ? "ring-2 ring-offset-1 ring-slate-400 rounded px-1" : ""} ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <Icon className={`h-4 w-4 ${color}`} />
      <span className="text-slate-700 font-medium">{value}</span>
    </button>
  );
}
