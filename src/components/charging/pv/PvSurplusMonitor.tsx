import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/hooks/useTranslation";
import { usePvSurplusFlow, usePvDecisionLog, type PvFlowConfig } from "@/hooks/usePvSurplusFlow";
import { pvT } from "@/lib/pvFlowI18n";
import PvLiveFlow from "./PvLiveFlow";
import PvDecisionView from "./PvDecisionView";
import PvAnalysisChart from "./PvAnalysisChart";
import PvSetupChecks, { buildPvChecks } from "./PvSetupChecks";

export default function PvSurplusMonitor({ config, locationId, compact = false }: { config: PvFlowConfig; locationId: string; compact?: boolean }) {
  const { language } = useTranslation();
  const { data, isLoading } = usePvSurplusFlow(config, locationId);
  const { data: logs = [] } = usePvDecisionLog(config);

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;
  const checks = buildPvChecks(config, data, logs[0] ?? null);
  const errors = checks.filter((c) => c.level === "error").length;

  return (
    <Tabs defaultValue={compact ? "live" : errors > 0 ? "checks" : "live"} className="w-full">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="live">{pvT(language, "live")}</TabsTrigger>
        <TabsTrigger value="decision">{pvT(language, "decision")}</TabsTrigger>
        <TabsTrigger value="analysis">{pvT(language, "analysis")}</TabsTrigger>
        <TabsTrigger value="checks">{pvT(language, "checks")}{errors > 0 ? ` (${errors})` : ""}</TabsTrigger>
      </TabsList>
      <p className="text-[11px] text-muted-foreground mt-1">
        {pvT(language, config.storage_id ? "withStorage" : "meterOnly")}
      </p>
      <TabsContent value="live"><PvLiveFlow data={data} /></TabsContent>
      <TabsContent value="decision"><PvDecisionView logs={logs} /></TabsContent>
      <TabsContent value="analysis"><PvAnalysisChart series={data.series} logs={logs} /></TabsContent>
      <TabsContent value="checks"><PvSetupChecks checks={checks} /></TabsContent>
    </Tabs>
  );
}
