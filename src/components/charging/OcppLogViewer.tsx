import { useState } from "react";
import { useOcppLogs, OcppLogEntry } from "@/hooks/useOcppLogs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, ChevronDown, ChevronRight, ArrowDownUp, Pause, Play } from "lucide-react";
import { format } from "date-fns";

interface OcppLogViewerProps {
  chargePointId?: string;
  showCpColumn?: boolean;
}

const OcppLogViewer = ({ chargePointId, showCpColumn = false }: OcppLogViewerProps) => {
  const { logs, loading, paused, setPaused, refetch } = useOcppLogs(chargePointId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [directionFilter, setDirectionFilter] = useState<"all" | "incoming" | "outgoing">("all");

  const filtered = logs.filter((l) => {
    if (directionFilter !== "all" && l.direction !== directionFilter) return false;
    if (filterText) {
      const search = filterText.toLowerCase();
      return (
        (l.message_type?.toLowerCase().includes(search)) ||
        l.charge_point_id.toLowerCase().includes(search) ||
        JSON.stringify(l.raw_message).toLowerCase().includes(search)
      );
    }
    return true;
  });

  const directionBadge = (dir: string) => {
    if (dir === "incoming") return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 text-xs">↓ Eingehend</Badge>;
    return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs">↑ Ausgehend</Badge>;
  };

  const messageTypeBadge = (type: string | null) => {
    if (!type) return <span className="text-muted-foreground text-xs">—</span>;
    const isError = type.startsWith("CALLERROR");
    return (
      <Badge variant={isError ? "destructive" : "outline"} className="text-xs font-mono">
        {type}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">OCPP-Nachrichtenlog</CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md overflow-hidden">
            {(["all", "incoming", "outgoing"] as const).map((d) => (
              <button
                key={d}
                className={`px-2 py-1 text-xs transition-colors ${directionFilter === d ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => setDirectionFilter(d)}
              >
                {d === "all" ? "Alle" : d === "incoming" ? "↓ Ein" : "↑ Aus"}
              </button>
            ))}
          </div>
          <Input
            placeholder="Filter..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-40 h-8 text-xs"
          />
          <Button
            variant={paused ? "default" : "outline"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setPaused(!paused)}
            title={paused ? "Fortsetzen" : "Pausieren"}
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={refetch}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Lade Logs...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ArrowDownUp className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Keine OCPP-Nachrichten vorhanden.</p>
            <p className="text-xs mt-1">Verbinde deine Wallbox mit der OCPP-URL, um hier Nachrichten zu sehen.</p>
          </div>
        ) : (
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="w-40">Zeitstempel</TableHead>
                  <TableHead className="w-24">Richtung</TableHead>
                  {showCpColumn && <TableHead>Ladepunkt</TableHead>}
                  <TableHead>Nachrichtentyp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => (
                  <>
                    <TableRow
                      key={log.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      <TableCell className="px-2">
                        {expandedId === log.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {format(new Date(log.created_at), "dd.MM.yy HH:mm:ss")}
                      </TableCell>
                      <TableCell>{directionBadge(log.direction)}</TableCell>
                      {showCpColumn && (
                        <TableCell className="font-mono text-xs">{log.charge_point_id}</TableCell>
                      )}
                      <TableCell>{messageTypeBadge(log.message_type)}</TableCell>
                    </TableRow>
                    {expandedId === log.id && (
                      <TableRow key={`${log.id}-detail`}>
                        <TableCell colSpan={showCpColumn ? 5 : 4} className="bg-muted/30 p-0">
                          <pre className="text-xs font-mono p-4 overflow-x-auto whitespace-pre-wrap break-all max-h-64">
                            {JSON.stringify(log.raw_message, null, 2)}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="mt-2 text-xs text-muted-foreground text-right">
          {filtered.length} Nachricht{filtered.length !== 1 ? "en" : ""}
          {filtered.length !== logs.length && ` (${logs.length} gesamt)`}
        </div>
      </CardContent>
    </Card>
  );
};

export default OcppLogViewer;
