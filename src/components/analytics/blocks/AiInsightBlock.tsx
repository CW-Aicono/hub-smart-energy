import { useState, useMemo } from "react";
import { AnalysisBlock } from "@/hooks/useAnalysisWorkspaces";
import { AnalyticsPeriod } from "@/hooks/useAnalyticsData";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from "date-fns";
import { de } from "date-fns/locale";

interface AiInsightBlockProps {
  block: AnalysisBlock;
  period: AnalyticsPeriod;
  offset: number;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
  allBlocks: AnalysisBlock[];
}

interface SeriesSummary {
  label: string;
  unit: string;
  stats: { min: number; max: number; avg: number; sum: number; count: number };
  peaks: { t: number; v: number }[];
  valleys: { t: number; v: number }[];
  samples: { t: number; v: number }[];
}

interface BlockSummary {
  id: string;
  title: string;
  type: string;
  series: SeriesSummary[];
}

function getRange(period: AnalyticsPeriod, offset: number) {
  const now = new Date();
  switch (period) {
    case "day": {
      const b = new Date(now);
      b.setDate(b.getDate() + offset);
      return { from: startOfDay(b), to: endOfDay(b) };
    }
    case "week": {
      const b = new Date(now);
      b.setDate(b.getDate() + offset * 7);
      return {
        from: startOfWeek(b, { locale: de, weekStartsOn: 1 }),
        to: endOfWeek(b, { locale: de, weekStartsOn: 1 }),
      };
    }
    case "month": {
      const b = new Date(now);
      b.setMonth(b.getMonth() + offset);
      return { from: startOfMonth(b), to: endOfMonth(b) };
    }
    case "quarter": {
      const b = new Date(now);
      b.setMonth(b.getMonth() + offset * 3);
      const q = Math.floor(b.getMonth() / 3);
      return {
        from: new Date(b.getFullYear(), q * 3, 1),
        to: new Date(b.getFullYear(), q * 3 + 3, 0, 23, 59, 59),
      };
    }
    case "year": {
      const b = new Date(now);
      b.setFullYear(b.getFullYear() + offset);
      return { from: startOfYear(b), to: endOfYear(b) };
    }
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

async function summarizeBlock(
  block: AnalysisBlock,
  period: AnalyticsPeriod,
  offset: number
): Promise<BlockSummary | null> {
  const meterIds = (block.config?.meterIds as string[] | undefined) ?? [];
  if (!meterIds.length) return null;

  const { data: meters } = await supabase
    .from("meters")
    .select("id, name, unit, source_unit_power, device_type")
    .in("id", meterIds);
  if (!meters?.length) return null;

  const range = getRange(period, offset);
  const seriesSummaries: SeriesSummary[] = [];

  for (const m of meters) {
    let points: { t: number; v: number }[] = [];
    try {
      if (period === "day") {
        const { data } = await supabase.rpc("get_power_readings_5min", {
          p_meter_ids: [m.id],
          p_start: range.from.toISOString(),
          p_end: range.to.toISOString(),
        });
        points = (data ?? []).map((r: any) => ({
          t: new Date(r.bucket).getTime(),
          v: Number(r.power_avg),
        }));
      } else {
        const { data } = await supabase.rpc("get_meter_daily_totals_split_with_fallback" as any, {
          p_meter_ids: [m.id],
          p_from_date: format(range.from, "yyyy-MM-dd"),
          p_to_date: format(range.to, "yyyy-MM-dd"),
        });
        points = (data ?? []).map((r: any) => ({
          t: new Date(r.day).getTime(),
          v: Number(r.bezug ?? 0) - Number(r.einspeisung ?? 0),
        }));
      }
    } catch (e) {
      console.warn("summarize meter fetch failed", m.id, e);
    }
    if (!points.length) continue;

    const values = points.map((p) => p.v).filter((v) => Number.isFinite(v));
    if (!values.length) continue;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;

    const sorted = [...points].sort((a, b) => b.v - a.v);
    const peaks = sorted.slice(0, 3);
    const valleys = sorted.slice(-3).reverse();

    const step = Math.max(1, Math.floor(points.length / 24));
    const samples = points.filter((_, i) => i % step === 0).slice(0, 30);

    seriesSummaries.push({
      label: m.name,
      unit: (m.unit ?? m.source_unit_power ?? "kW").toString(),
      stats: {
        min: Number(min.toFixed(3)),
        max: Number(max.toFixed(3)),
        avg: Number(avg.toFixed(3)),
        sum: Number(sum.toFixed(3)),
        count: values.length,
      },
      peaks,
      valleys,
      samples,
    });
  }

  if (!seriesSummaries.length) return null;
  return { id: block.id, title: block.title, type: block.type, series: seriesSummaries };
}

// Very small markdown-ish renderer supporting bold, bullets, and [[block:id]] refs.
function renderAnalysis(
  text: string,
  blockTitles: Record<string, string>,
  onRefClick: (id: string) => void
) {
  const REF_RE = /\[\[block:([a-zA-Z0-9_-]+)\]\]/g;
  const BOLD_RE = /\*\*(.+?)\*\*/g;

  const renderInline = (line: string, keyBase: string) => {
    const nodes: React.ReactNode[] = [];
    let last = 0;
    let idx = 0;
    // First replace refs
    line.replace(REF_RE, (match, id, offset: number) => {
      if (offset > last) nodes.push(line.slice(last, offset));
      const title = blockTitles[id] ?? "Block";
      nodes.push(
        <button
          key={`${keyBase}-ref-${idx++}`}
          type="button"
          onClick={() => onRefClick(id)}
          className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          → {title}
        </button>
      );
      last = offset + match.length;
      return match;
    });
    if (last < line.length) nodes.push(line.slice(last));

    // Then handle bold in remaining string nodes
    return nodes.flatMap((n, i) => {
      if (typeof n !== "string") return [n];
      const parts: React.ReactNode[] = [];
      let l = 0;
      let bIdx = 0;
      n.replace(BOLD_RE, (match, inner, offset: number) => {
        if (offset > l) parts.push(n.slice(l, offset));
        parts.push(
          <strong key={`${keyBase}-b-${i}-${bIdx++}`} className="font-semibold text-foreground">
            {inner}
          </strong>
        );
        l = offset + match.length;
        return match;
      });
      if (l < n.length) parts.push(n.slice(l));
      return parts;
    });
  };

  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let buffer: React.ReactNode[] = [];
  const flushPara = (key: string) => {
    if (buffer.length) {
      out.push(
        <p key={`p-${key}`} className="text-sm leading-relaxed">
          {buffer}
        </p>
      );
      buffer = [];
    }
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara(`b-${i}`);
      return;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara(`b-${i}`);
      const content = line.replace(/^\s*[-*]\s+/, "");
      out.push(
        <div key={`li-${i}`} className="flex gap-2 text-sm leading-relaxed">
          <span className="text-primary mt-0.5">•</span>
          <div className="flex-1">{renderInline(content, `li-${i}`)}</div>
        </div>
      );
    } else if (/^#{1,3}\s+/.test(line)) {
      flushPara(`b-${i}`);
      out.push(
        <div key={`h-${i}`} className="text-sm font-semibold text-foreground mt-1">
          {renderInline(line.replace(/^#{1,3}\s+/, ""), `h-${i}`)}
        </div>
      );
    } else {
      if (buffer.length) buffer.push(" ");
      buffer.push(...renderInline(line, `p-${i}`));
    }
  });
  flushPara("end");
  return out;
}

export function AiInsightBlock({ block, period, offset, onConfigChange, allBlocks }: AiInsightBlockProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = block.config.result as
    | { analysis: string; refs: string[]; generatedAt: string; period: string; offset: number }
    | undefined;

  const blockTitles = useMemo(() => {
    const map: Record<string, string> = {};
    allBlocks.forEach((b) => (map[b.id] = b.title || "Block"));
    return map;
  }, [allBlocks]);

  const analyzableBlocks = useMemo(
    () => allBlocks.filter((b) => b.id !== block.id && ((b.config?.meterIds as string[] | undefined)?.length ?? 0) > 0),
    [allBlocks, block.id]
  );

  const analyze = async () => {
    if (analyzableBlocks.length === 0) {
      toast.error("Keine Blöcke mit Geräten für die Analyse vorhanden");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const summaries = (
        await Promise.all(analyzableBlocks.map((b) => summarizeBlock(b, period, offset)))
      ).filter((s): s is BlockSummary => s !== null);

      if (summaries.length === 0) {
        setError("Keine Messdaten im aktuellen Zeitraum gefunden.");
        return;
      }

      const rangeR = getRange(period, offset);
      const rangeLabel = `${rangeR.from.toLocaleDateString("de-DE")} – ${rangeR.to.toLocaleDateString("de-DE")}`;

      const { data, error: fnError } = await supabase.functions.invoke("analytics-insight", {
        body: { period, offset, rangeLabel, blocks: summaries },
      });

      if (fnError) {
        const message = (data as any)?.error ?? fnError.message ?? "Analyse fehlgeschlagen";
        setError(message);
        return;
      }

      const payload = data as { analysis: string; refs: string[]; generatedAt: string };
      onConfigChange(block.id, {
        ...block.config,
        result: {
          analysis: payload.analysis,
          refs: payload.refs ?? [],
          generatedAt: payload.generatedAt,
          period,
          offset,
        },
      });
      toast.success("Analyse erstellt");
    } catch (e) {
      console.error(e);
      setError((e as Error).message ?? "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  };

  const scrollToBlock = (id: string) => {
    const el = document.querySelector(`[data-block-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1600);
    }
  };

  const isStale =
    result && (result.period !== period || result.offset !== offset);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>KI-Analyse · {analyzableBlocks.length} Block{analyzableBlocks.length !== 1 ? "s" : ""}</span>
          {isStale && <span className="text-amber-600">· veraltet</span>}
        </div>
        <Button
          size="sm"
          variant={result ? "outline" : "default"}
          className="h-7 text-xs gap-1"
          onClick={analyze}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysiere…
            </>
          ) : result ? (
            <>
              <RefreshCw className="h-3.5 w-3.5" /> Neu analysieren
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" /> Was ist hier passiert?
            </>
          )}
        </Button>
      </div>

      <div className={cn("flex-1 min-h-0 overflow-auto rounded-lg border bg-muted/20 p-3 space-y-2")}>
        {error && (
          <div className="flex items-start gap-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {!error && !result && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-6">
            <Sparkles className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">
              Klicke auf <span className="font-medium text-foreground">„Was ist hier passiert?"</span>, um Auffälligkeiten in
              den anderen Blöcken zu erklären.
            </p>
            <p className="text-[11px] mt-1">
              Nutzt Messwerte aus {analyzableBlocks.length || "0"} Analyse-Block{analyzableBlocks.length !== 1 ? "s" : ""} im
              aktuellen Zeitraum.
            </p>
          </div>
        )}

        {loading && !result && (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-8">
            <Loader2 className="h-6 w-6 animate-spin mb-2" />
            <p className="text-xs">Sammle Messdaten und frage die KI…</p>
          </div>
        )}

        {result && (
          <div className="space-y-1.5">
            {renderAnalysis(result.analysis, blockTitles, scrollToBlock)}
            <div className="pt-2 mt-2 border-t border-border/50 text-[10px] text-muted-foreground flex items-center justify-between">
              <span>
                Erstellt {new Date(result.generatedAt).toLocaleString("de-DE")}
              </span>
              {result.refs.length > 0 && (
                <span>{result.refs.length} Block-Verweis{result.refs.length !== 1 ? "e" : ""}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
