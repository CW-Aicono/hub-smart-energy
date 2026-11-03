import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { fmtW } from "@/lib/pvFlow";
import { pvT } from "@/lib/pvFlowI18n";

interface Step { key: string; label: string; w: number }

const STEP_COLOR: Record<string, string> = {
  grid: "hsl(var(--energy-strom))",
  raw_surplus: "hsl(var(--pv-actual))",
  buffer: "hsl(var(--muted-foreground))",
  storage: "hsl(var(--primary))",
  available: "hsl(var(--pv-actual))",
  allocated: "hsl(var(--chart-2))",
};

const ACTION_LABEL: Record<string, string> = { charge: "Laden", charge_min: "Mindestleistung", pause: "Pausiert" };

export default function PvDecisionView({ logs }: { logs: any[] }) {
  const { language } = useTranslation();
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(99);

  const log = logs[idx];
  const steps: Step[] = (log?.decision?.steps ?? []) as Step[];
  const maxW = Math.max(1, ...steps.map((s) => Math.abs(s.w)));

  useEffect(() => { setRevealed(99); }, [idx]);
  useEffect(() => {
    if (revealed >= steps.length) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), 700);
    return () => clearTimeout(t);
  }, [revealed, steps.length]);

  if (!logs.length) return <p className="text-xs text-muted-foreground">{pvT(language, "noDecisions")}</p>;

  const statusVariant = log.status === "error" ? "destructive" : log.status === "no_data" ? "secondary" : "default";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-7" onClick={() => setIdx((i) => Math.min(logs.length - 1, i + 1))} disabled={idx >= logs.length - 1}>
          <ChevronLeft className="h-3.5 w-3.5" /> {pvT(language, "older")}
        </Button>
        <span className="text-xs tabular-nums">
          {new Date(log.executed_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "medium" })}
        </span>
        <Button size="sm" variant="outline" className="h-7" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
          {pvT(language, "newer")} <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="secondary" className="h-7 gap-1" onClick={() => setRevealed(0)} disabled={!steps.length}>
          <Play className="h-3.5 w-3.5" /> {pvT(language, "play")}
        </Button>
        <Badge variant={statusVariant as any} className="ml-auto">{log.status}</Badge>
      </div>

      {(log.decision?.reason || log.error_message) && (
        <p className="text-sm font-medium">{log.decision?.reason ?? log.error_message}</p>
      )}

      {steps.length > 0 && (
        <div className="space-y-1.5">
          {steps.map((s, i) => {
            const visible = i < revealed;
            const pct = (Math.abs(s.w) / maxW) * 100;
            return (
              <div key={s.key + i} className="grid grid-cols-[170px_1fr_90px] items-center gap-2 text-xs" style={{ opacity: visible ? 1 : 0.15, transition: "opacity 400ms" }}>
                <span className="truncate">{s.label}</span>
                <div className="h-4 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: visible ? `${pct}%` : "0%", background: STEP_COLOR[s.key] ?? "hsl(var(--primary))", transition: "width 600ms ease-out" }} />
                </div>
                <span className="text-right tabular-nums">{fmtW(s.w)}</span>
              </div>
            );
          })}
        </div>
      )}

      {log.decision?.storage && (
        <p className="text-[11px] text-muted-foreground">
          {pvT(language, "storage")}: {log.decision.storage.target_kw != null ? `${Number(log.decision.storage.target_kw).toLocaleString("de-DE")} kW` : "–"}
          {log.decision.storage.coupled ? ` · ${pvT(language, "coupled")}` : ""}
          {log.decision.storage.error ? ` · ${log.decision.storage.error}` : ""}
        </p>
      )}

      {Array.isArray(log.actions_taken) && log.actions_taken.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {log.actions_taken.map((a: any) => (
            <Badge key={a.connector_id} variant="outline" className="text-[11px]">
              {ACTION_LABEL[a.action] ?? a.action}: {fmtW(a.assigned_w)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
