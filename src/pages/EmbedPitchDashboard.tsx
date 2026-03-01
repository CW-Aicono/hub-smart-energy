import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, MapPin, Gauge, Plug, Zap } from "lucide-react";

interface PitchStats {
  tenants: number;
  locations: number;
  meters: number;
  charge_points: number;
  integrations: number;
  fetched_at: string;
}

function useEmbedAuth() {
  const params = new URLSearchParams(window.location.search);
  return params.get("key") || "";
}

function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) return;
    const duration = 1200;
    const steps = 40;
    const increment = value / steps;
    let current = 0;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), value);
      setDisplay(current);
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{display.toLocaleString("de-DE")}{suffix}</span>;
}

const KPI_CARDS = [
  { key: "tenants" as const, label: "Mandanten", icon: Building2, color: "hsl(var(--primary))" },
  { key: "locations" as const, label: "Standorte", icon: MapPin, color: "hsl(var(--accent))" },
  { key: "meters" as const, label: "Zähler", icon: Gauge, color: "hsl(var(--chart-4))" },
  { key: "charge_points" as const, label: "Ladepunkte", icon: Zap, color: "hsl(var(--chart-3))" },
  { key: "integrations" as const, label: "Integrationen", icon: Plug, color: "hsl(var(--chart-2))" },
];

export default function EmbedPitchDashboard() {
  const apiKey = useEmbedAuth();
  const [stats, setStats] = useState<PitchStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!apiKey) {
      setError("Missing API key");
      setLoading(false);
      return;
    }

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pitch-stats`;
    fetch(url, {
      headers: { "x-pitch-api-key": apiKey },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [apiKey]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!apiKey || error) return;
    const interval = setInterval(() => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pitch-stats`;
      fetch(url, { headers: { "x-pitch-api-key": apiKey } })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setStats(data); });
    }, 30_000);
    return () => clearInterval(interval);
  }, [apiKey, error]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-transparent p-4">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-transparent p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-transparent p-4 md:p-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 max-w-5xl mx-auto">
        {KPI_CARDS.map(({ key, label, icon: Icon, color }) => (
          <Card key={key} className="border-none shadow-lg bg-card/80 backdrop-blur-sm">
            <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
              <div
                className="rounded-full p-2"
                style={{ backgroundColor: `${color}15` }}
              >
                <Icon className="h-5 w-5" style={{ color }} />
              </div>
              <span className="text-2xl md:text-3xl font-bold text-foreground">
                <AnimatedCounter value={stats[key]} />
              </span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                {label}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-center text-[10px] text-muted-foreground/50 mt-4">
        Live · {new Date(stats.fetched_at).toLocaleString("de-DE")}
      </p>
    </div>
  );
}
