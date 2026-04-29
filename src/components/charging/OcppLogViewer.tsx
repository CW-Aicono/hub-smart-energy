import React, { useState } from "react";
import { useOcppLogs, OcppLogEntry } from "@/hooks/useOcppLogs";
import { useChargePoints } from "@/hooks/useChargePoints";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, ChevronDown, ChevronRight, ArrowDownUp, Pause, Play, Wifi, WifiOff } from "lucide-react";
import { format } from "date-fns";

interface OcppLogViewerProps {
  chargePointId?: string;
  showCpColumn?: boolean;
}

const OcppLogViewer = ({ chargePointId, showCpColumn = false }: OcppLogViewerProps) => {
  const { logs, loading, paused, setPaused, refetch } = useOcppLogs(chargePointId);
  const { chargePoints } = useChargePoints();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [directionFilter, setDirectionFilter] = useState<"all" | "incoming" | "outgoing" | "error">("all");
  const [messageTypeFilter, setMessageTypeFilter] = useState<string>("all");

  // Standard OCPP 1.6 message types + types found in current logs
  const STANDARD_OCPP_TYPES = [
    "Authorize", "BootNotification", "CALLERROR", "CALLRESULT",
    "ChangeAvailability", "ChangeConfiguration", "ClearCache",
    "DataTransfer", "DiagnosticsStatusNotification", "FirmwareStatusNotification",
    "GetConfiguration", "Heartbeat", "MeterValues", "RemoteStartTransaction",
    "RemoteStopTransaction", "Reset", "StartTransaction", "StatusNotification",
    "StopTransaction", "TriggerMessage", "UnlockConnector",
  ];
  const messageTypes = Array.from(
    new Set([
      ...STANDARD_OCPP_TYPES,
      ...(logs.map((l) => l.message_type).filter(Boolean) as string[]),
    ])
  ).sort();

  // Detect Preparing→Available timeout (no StartTransaction in between)
  const timeoutIds = new Set<string>();
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    // Look for StatusNotification → Available (without vendorErrorCode)
    const rawStr = JSON.stringify(log.raw_message);
    if (log.message_type === "StatusNotification" && rawStr.includes('"Available"') && !rawStr.match(/"vendorErrorCode"\s*:\s*"(?!0x00000000")[^"]+"/)) {
      // Search forward (older entries) for the matching Preparing without a StartTransaction in between
      for (let j = i + 1; j < logs.length; j++) {
        const prev = logs[j];
        if (prev.charge_point_id !== log.charge_point_id) continue;
        if (prev.message_type === "StartTransaction") break; // transaction started, not a timeout
        if (prev.message_type === "StatusNotification" && JSON.stringify(prev.raw_message).includes('"Preparing"')) {
          timeoutIds.add(log.id);
          break;
        }
        if (prev.message_type === "StatusNotification") break; // other status change
      }
    }
  }

  const isErrorEntry = (l: OcppLogEntry): boolean => {
    if (l.message_type?.startsWith("CALLERROR")) return true;
    const rawStr = JSON.stringify(l.raw_message);
    if (rawStr.includes('"Faulted"')) return true;
    const vecMatch = rawStr.match(/"vendorErrorCode"\s*:\s*"([^"]+)"/);
    if (vecMatch && vecMatch[1] && vecMatch[1] !== "" && vecMatch[1] !== "0" && vecMatch[1] !== "0x00000000") return true;
    return false;
  };

  const filtered = logs.filter((l) => {
    if (directionFilter === "incoming" && l.direction !== "incoming") return false;
    if (directionFilter === "outgoing" && l.direction !== "outgoing") return false;
    if (directionFilter === "error" && !isErrorEntry(l)) return false;
    if (messageTypeFilter !== "all" && l.message_type !== messageTypeFilter) return false;
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

  const extractVendorErrorCode = (log: OcppLogEntry): string | null => {
    try {
      const raw = JSON.stringify(log.raw_message);
      const match = raw.match(/"vendorErrorCode"\s*:\s*"([^"]+)"/);
      if (match && match[1] && match[1] !== "" && match[1] !== "0" && match[1] !== "0x00000000") {
        return match[1];
      }
    } catch {}
    return null;
  };

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
        <div className="flex items-center gap-3">
          <CardTitle className="text-base">OCPP-Nachrichtenlog</CardTitle>
          {chargePointId && (() => {
            // chargePointId is the UUID (cp.id), since logs store the UUID in charge_point_id
            const cp = chargePoints.find(c => c.id === chargePointId || c.ocpp_id === chargePointId);
            if (!cp) return null;
            return cp.ws_connected ? (
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs gap-1">
                <Wifi className="h-3 w-3" /> WS Online
              </Badge>
            ) : (
              <Badge className="bg-muted text-muted-foreground border-muted text-xs gap-1">
                <WifiOff className="h-3 w-3" /> WS Offline
              </Badge>
            );
          })()}
        </div>
        <div className="flex items-center gap-2">
          <Select value={messageTypeFilter} onValueChange={setMessageTypeFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Nachrichtentyp" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Typen</SelectItem>
              {messageTypes.map((mt) => (
                <SelectItem key={mt} value={mt}>{mt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={directionFilter} onValueChange={(v) => setDirectionFilter(v as typeof directionFilter)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="incoming">↓ Ein</SelectItem>
              <SelectItem value="outgoing">↑ Aus</SelectItem>
              <SelectItem value="error">⚠ Fehler</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Suche..."
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
                  <React.Fragment key={log.id}>
                    <TableRow
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
                        <TableCell className="font-mono text-xs">
                          <span className="flex items-center gap-1.5">
                            {(() => {
                              // log.charge_point_id is now the UUID; match by id, fall back to ocpp_id
                              const cp = chargePoints.find(c => c.id === log.charge_point_id || c.ocpp_id === log.charge_point_id);
                              const connected = cp?.ws_connected;
                              return connected
                                ? <Wifi className="h-3 w-3 text-emerald-500 shrink-0" />
                                : <WifiOff className="h-3 w-3 text-muted-foreground shrink-0" />;
                            })()}
                            {(() => {
                              const cp = chargePoints.find(c => c.id === log.charge_point_id || c.ocpp_id === log.charge_point_id);
                              return cp?.ocpp_id ?? log.charge_point_id;
                            })()}
                          </span>
                        </TableCell>
                      )}
                      <TableCell className="flex items-center gap-2 flex-wrap">
                        {messageTypeBadge(log.message_type)}
                        {(() => {
                          const vec = extractVendorErrorCode(log);
                          if (vec) return (
                            <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-xs whitespace-nowrap font-mono">
                              ⚠ vendorErrorCode: {vec}
                            </Badge>
                          );
                          if (timeoutIds.has(log.id)) return (
                            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-xs whitespace-nowrap">
                              ⏱ Timeout – kein Fahrzeug
                            </Badge>
                          );
                          return null;
                        })()}
                      </TableCell>
                    </TableRow>
                    {expandedId === log.id && (
                      <TableRow>
                        <TableCell colSpan={showCpColumn ? 5 : 4} className="bg-muted/30 p-0">
                          <pre className="text-xs font-mono p-4 overflow-x-auto whitespace-pre-wrap break-all max-h-64">
                            {JSON.stringify(log.raw_message, null, 2)}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
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
