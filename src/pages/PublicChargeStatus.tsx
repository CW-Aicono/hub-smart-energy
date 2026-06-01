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
  Check,
  X,
} from "lucide-react";
import {
  normalizeChargePointStatus,
  type ChargePointStatusKey,
} from "@/lib/chargePointStatus";

interface ChargePoint {
  id: string;
  name: string;
  ocpp_id: string | null;
  status: string;
  connector_count: number;
  ws_connected: boolean;
  last_heartbeat: string | null;
  group_id: string | null;
}

interface Connector {
  charge_point_id: string;
  connector_id: number;
  status: string;
  name: string | null;
  display_order: number;
  connector_type: string;
}

interface Group {
  id: string;
  name: string;
}

interface ApiResponse {
  tenant: { name: string; logo_url: string | null };
  groups?: Group[];
  charge_points: ChargePoint[];
  connectors: Connector[];
  generated_at: string;
}

type StatusKey = ChargePointStatusKey;

const STATUS_META: Record<StatusKey, { label: string; bg: string; icon: typeof Zap; iconClass: string }> = {
  available:    { label: "Verfügbar",     bg: "bg-emerald-600 text-white",                icon: Zap,         iconClass: "text-emerald-100" },
  charging:     { label: "Belegt",        bg: "bg-blue-600 text-white",                   icon: PlugZap,     iconClass: "text-blue-100" },
  faulted:      { label: "Fehler",        bg: "bg-red-600 text-white",                    icon: AlertTriangle, iconClass: "text-red-100" },
  offline:      { label: "Offline",       bg: "bg-slate-500 text-white",                  icon: WifiOff,     iconClass: "text-slate-100" },
  unavailable:  { label: "Nicht verfügbar", bg: "bg-amber-500 text-white",                icon: ZapOff,      iconClass: "text-amber-100" },
  unconfigured: { label: "Nicht eingerichtet",  bg: "bg-purple-500 text-white",           icon: Settings,    iconClass: "text-purple-100" },
};

interface CardData {
  key: string;
  name: string;
  ocppId: string | null;
  status: StatusKey;
  groupId: string | null;
  connectors: Array<{ id: number; label: string; status: StatusKey }> | null;
}



export default function PublicChargeStatus() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusKey | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

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
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  const cards: CardData[] = useMemo(() => {
    if (!data) return [];
    const result: CardData[] = [];
    for (const cp of data.charge_points) {
      const hasOcppId = !!cp.ocpp_id && cp.ocpp_id.trim() !== "";
      const connsRaw = data.connectors
        .filter((c) => c.charge_point_id === cp.id)
        .sort((a, b) => a.display_order - b.display_order || a.connector_id - b.connector_id);

      // Fallback: bekannte Steckerzahl > vorhandene Connector-Rows -> virtuelle Kacheln auffüllen
      const conns: Array<Connector | null> = [...connsRaw];
      const declared = Math.max(1, cp.connector_count || 1);
      if (conns.length < declared) {
        const existingIds = new Set(connsRaw.map((c) => c.connector_id));
        for (let i = 1; i <= declared; i++) {
          if (!existingIds.has(i)) conns.push(null);
        }
      }

      const effective = conns.length > 0 ? conns : [null];

      const connectors = effective.map((c, idx) => {
        const connectorId = c?.connector_id ?? idx + 1;
        const label = c?.name?.trim() || `Stecker ${connectorId}`;
        return {
          id: connectorId,
          label,
          status: normalizeChargePointStatus({
            hasOcppId,
            wsConnected: cp.ws_connected,
            rawStatus: c?.status ?? cp.status,
          }),
        };
      });

      // Aggregierter Status für die Kachel: schlechtester Status hat Vorrang
      const priority: StatusKey[] = ["faulted", "offline", "unconfigured", "unavailable", "charging", "available"];
      const aggregated = priority.find((s) => connectors.some((c) => c.status === s)) ?? connectors[0].status;

      result.push({
        key: cp.id,
        name: cp.name,
        ocppId: cp.ocpp_id,
        status: aggregated,
        groupId: cp.group_id ?? null,
        connectors: connectors.length > 1 ? connectors : null,
      });
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
    for (const card of cards) {
      if (card.connectors && card.connectors.length > 0) {
        for (const conn of card.connectors) c[conn.status]++;
      } else {
        c[card.status]++;
      }
    }
    return c;
  }, [cards]);

  const filteredCards = filter ? cards.filter((c) => c.status === filter) : cards;

  // Nach Gruppen bündeln, "Ohne Gruppe" am Ende
  const groupedCards = useMemo(() => {
    const groupsList = data?.groups ?? [];
    const byId = new Map<string, { name: string; cards: CardData[] }>();
    for (const g of groupsList) byId.set(g.id, { name: g.name, cards: [] });
    const ungrouped: CardData[] = [];
    for (const card of filteredCards) {
      if (card.groupId && byId.has(card.groupId)) {
        byId.get(card.groupId)!.cards.push(card);
      } else {
        ungrouped.push(card);
      }
    }
    const sections: Array<{ id: string | null; name: string; cards: CardData[] }> = [];
    for (const g of groupsList) {
      const entry = byId.get(g.id);
      if (entry && entry.cards.length > 0) sections.push({ id: g.id, name: g.name, cards: entry.cards });
    }
    if (ungrouped.length > 0) sections.push({ id: null, name: "Ohne Gruppe", cards: ungrouped });
    return sections;
  }, [filteredCards, data?.groups]);



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
            {data.tenant.logo_url && !logoFailed ? (
              <img
                src={data.tenant.logo_url}
                alt={data.tenant.name}
                className="h-8 w-8 object-contain"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <div className="h-8 w-8 rounded bg-slate-800 flex items-center justify-center text-white font-bold text-xs">
                {data.tenant.name?.[0] ?? "?"}
              </div>
            )}
            <h1 className="text-lg font-semibold text-slate-900">{data.tenant.name}</h1>
            <span
              className="inline-flex items-center gap-1.5 ml-2 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium"
              title="Letzter Statusabruf"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {new Date(data.generated_at).toLocaleTimeString("de-DE")}
            </span>
            <div className="relative">
              <button
                onClick={() => setFilterOpen((o) => !o)}
                className="ml-2 inline-flex items-center gap-1.5 px-3 py-1 rounded border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Filter className="h-3.5 w-3.5" />
                Filter {filter ? `(1)` : ""}
              </button>
              {filterOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setFilterOpen(false)}
                  />
                  <div className="absolute left-0 top-full mt-1 z-20 w-56 bg-white border border-slate-200 rounded-md shadow-lg py-1">
                    <div className="px-3 py-1.5 text-xs font-medium text-slate-500 border-b border-slate-100 flex items-center justify-between">
                      <span>Nach Status filtern</span>
                      {filter && (
                        <button
                          onClick={() => { setFilter(null); setFilterOpen(false); }}
                          className="text-slate-400 hover:text-slate-700 inline-flex items-center gap-0.5"
                          title="Filter zurücksetzen"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {(Object.keys(STATUS_META) as StatusKey[]).map((key) => {
                      const meta = STATUS_META[key];
                      const Icon = meta.icon;
                      const active = filter === key;
                      return (
                        <button
                          key={key}
                          onClick={() => { setFilter(active ? null : key); setFilterOpen(false); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 text-slate-700"
                        >
                          <Icon className="h-3.5 w-3.5 text-slate-500" />
                          <span className="flex-1 text-left">{meta.label}</span>
                          <span className="text-xs text-slate-400">{counters[key]}</span>
                          {active && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
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
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {filteredCards.length === 0 ? (
          <div className="text-center text-slate-500 py-16">Keine Ladepunkte vorhanden.</div>
        ) : (
          groupedCards.map((section) => (
            <section key={section.id ?? "__ungrouped"}>
              {(groupedCards.length > 1 || section.id) && (
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
                    {section.name}
                  </h2>
                  <span className="text-xs text-slate-500">({section.cards.length})</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
              )}
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {section.cards.map((card) => {
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
                      {card.connectors && (
                        <div className="mt-3 space-y-1.5">
                          {card.connectors.map((conn) => {
                            const cMeta = STATUS_META[conn.status];
                            const CIcon = cMeta.icon;
                            return (
                              <div
                                key={conn.id}
                                className="flex items-center justify-between gap-2 text-xs bg-white/15 rounded px-2 py-1"
                              >
                                <span className="truncate">{conn.label}</span>
                                <span className="inline-flex items-center gap-1 opacity-95 shrink-0">
                                  <CIcon className={`h-3 w-3 ${cMeta.iconClass}`} />
                                  {cMeta.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {card.ocppId ? (
                        <div className="mt-3 text-xs opacity-80 font-mono">#{card.ocppId}</div>
                      ) : (
                        <div className="mt-3 text-xs opacity-80 italic">OCPP-ID fehlt</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
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
