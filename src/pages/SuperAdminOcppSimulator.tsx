import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import OcppFrameLog from "@/components/super-admin/OcppFrameLog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { OcppSimulatorClient, type ConnectionStatus, type FrameLogEntry } from "@/lib/ocppSimulatorClient";
import { Plug, PlugZap, Power, Heart, RadioTower, Play, Square, Send, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const STATUS_OPTIONS = ["Available", "Preparing", "Charging", "SuspendedEV", "SuspendedEVSE", "Finishing", "Faulted", "Unavailable"];
const ERROR_CODES = ["NoError", "ConnectorLockFailure", "EVCommunicationError", "GroundFailure", "HighTemperature", "InternalError", "OverCurrentFailure", "PowerMeterFailure", "ResetFailure"];

interface ChargePointRow {
  id: string;
  name: string;
  ocpp_id: string;
  has_password: boolean;
  tenant_id: string;
}

const SuperAdminOcppSimulator = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();

  // Form state
  const [target, setTarget] = useState("wss://ocpp.aicono.org");
  const [selectedCpId, setSelectedCpId] = useState<string>("");
  const [vendor, setVendor] = useState("AICONO");
  const [model, setModel] = useState("SimBox");
  const [serial, setSerial] = useState("");
  const [firmware, setFirmware] = useState("1.0.0");
  const [connectorId, setConnectorId] = useState(1);
  const [statusValue, setStatusValue] = useState("Available");
  const [errorCode, setErrorCode] = useState("NoError");
  const [idTag, setIdTag] = useState("APP_USER");
  const [powerKw, setPowerKw] = useState(11);
  const [meterValuesIntervalSec, setMeterValuesIntervalSec] = useState(60);
  const [customFrame, setCustomFrame] = useState('[2,"manual-1","Heartbeat",{}]');

  // Runtime
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<FrameLogEntry[]>([]);
  const clientRef = useRef<OcppSimulatorClient | null>(null);

  // Load charge points via edge function (bypasses RLS for super-admins)
  const { data: chargePoints = [], isLoading: cpLoading } = useQuery({
    queryKey: ["sa-ocpp-sim-charge-points"],
    enabled: !!user && isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ocpp-simulator-proxy", {
        method: "GET",
        // @ts-expect-error supabase-js types don't include query, but the runtime appends it
        query: { action: "list-charge-points" },
      });
      // Fallback: invoke() may not support query; build URL manually
      if (error || !data) {
        const session = (await supabase.auth.getSession()).data.session;
        const token = session?.access_token;
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpp-simulator-proxy?action=list-charge-points`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const json = await res.json();
        return (json.charge_points ?? []) as ChargePointRow[];
      }
      return ((data as { charge_points?: ChargePointRow[] }).charge_points ?? []);
    },
  });

  const selectedCp = useMemo(
    () => chargePoints.find((c) => c.id === selectedCpId),
    [chargePoints, selectedCpId]
  );

  useEffect(() => {
    if (selectedCp && !serial) setSerial(selectedCp.ocpp_id);
  }, [selectedCp, serial]);

  useEffect(() => {
    return () => {
      try { clientRef.current?.disconnect(); } catch { /* ignore */ }
    };
  }, []);

  if (authLoading || roleLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const isConnected = status === "connected";

  const ensureConnected = (): OcppSimulatorClient | null => {
    if (!clientRef.current || !isConnected) {
      toast({ title: "Nicht verbunden", description: "Bitte zuerst verbinden.", variant: "destructive" });
      return null;
    }
    return clientRef.current;
  };

  const handleConnect = async () => {
    if (!selectedCp) {
      toast({ title: "Bitte Wallbox auswählen", variant: "destructive" });
      return;
    }
    if (!selectedCp.has_password) {
      toast({
        title: "Kein OCPP-Passwort gesetzt",
        description: `Für '${selectedCp.name}' ist kein Passwort hinterlegt. Bitte unter Ladepunkt-Details ergänzen.`,
        variant: "destructive",
      });
      return;
    }
    try {
      setBusy("connect");
      const client = new OcppSimulatorClient({
        target: target.trim().replace(/\/+$/, ""),
        ocppId: selectedCp.ocpp_id,
        vendor, model, serial: serial || selectedCp.ocpp_id, firmware,
      });
      client.onLog((entry) => setLogEntries((prev) => [...prev, entry].slice(-1000)));
      client.onStatus((s) => setStatus(s));
      clientRef.current = client;
      await client.connect();
      toast({ title: "Verbunden", description: `${selectedCp.name} ist verbunden.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Verbindung fehlgeschlagen", description: msg, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = () => {
    try { clientRef.current?.disconnect(); } catch { /* ignore */ }
  };

  const wrap = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); }
    catch (e) {
      toast({ title: `${label} fehlgeschlagen`, description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
    finally { setBusy(null); }
  };

  const sendBoot = () => {
    const c = ensureConnected(); if (!c) return;
    return wrap("Boot", () => c.sendBootNotification());
  };
  const sendHeartbeat = () => {
    const c = ensureConnected(); if (!c) return;
    return wrap("Heartbeat", () => c.sendHeartbeat());
  };
  const sendStatus = () => {
    const c = ensureConnected(); if (!c) return;
    return wrap("Status", () => c.sendStatusNotification(statusValue, errorCode, connectorId));
  };
  const startTx = () => {
    const c = ensureConnected(); if (!c) return;
    return wrap("Start", () => c.startTransaction({ idTag, connectorId, powerKw, intervalSec: meterValuesIntervalSec }));
  };
  const stopTx = () => {
    const c = ensureConnected(); if (!c) return;
    return wrap("Stop", () => c.stopTransaction(idTag));
  };
  const sendCustom = () => {
    const c = ensureConnected(); if (!c) return;
    return wrap("Custom", () => c.sendCustomFrame(customFrame));
  };

  const statusBadge = () => {
    switch (status) {
      case "connected":
        return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1"><PlugZap className="h-3 w-3" /> Verbunden</Badge>;
      case "connecting":
        return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Verbinde…</Badge>;
      case "error":
        return <Badge variant="destructive" className="gap-1">Fehler</Badge>;
      default:
        return <Badge variant="outline" className="gap-1"><Plug className="h-3 w-3" /> Getrennt</Badge>;
    }
  };

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: `hsl(var(--sa-background))`, color: `hsl(var(--sa-foreground))` }}>
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-4 md:p-8 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><RadioTower className="h-6 w-6" /> OCPP-Simulator</h1>
              <p className="text-sm" style={{ color: `hsl(var(--sa-muted-foreground))` }}>
                Teste den OCPP-Server, ohne eine echte Wallbox zu brauchen.
              </p>
            </div>
            <div className="flex items-center gap-2">{statusBadge()}</div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Connection */}
            <Card style={{ backgroundColor: `hsl(var(--sa-card))`, borderColor: `hsl(var(--sa-border))` }}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Plug className="h-4 w-4" /> Verbindung</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Wallbox</Label>
                  <Select value={selectedCpId} onValueChange={setSelectedCpId} disabled={isConnected || cpLoading}>
                    <SelectTrigger><SelectValue placeholder={cpLoading ? "Laden…" : "Wallbox auswählen"} /></SelectTrigger>
                    <SelectContent>
                      {chargePoints.map((cp) => (
                        <SelectItem key={cp.id} value={cp.id}>
                          {cp.name} ({cp.ocpp_id}) {cp.has_password ? "" : "⚠ kein Passwort"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedCp && !selectedCp.has_password && (
                    <p className="text-xs text-destructive mt-1">
                      Diese Wallbox hat kein OCPP-Passwort. Bitte unter Ladepunkt-Details setzen.
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Ziel-Server (URL ohne /id)</Label>
                  <Input value={target} onChange={(e) => setTarget(e.target.value)} disabled={isConnected} placeholder="wss://ocpp.aicono.org" className="font-mono" />
                  {selectedCp && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      → {target.replace(/\/+$/, "")}/{selectedCp.ocpp_id}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  {!isConnected ? (
                    <Button onClick={handleConnect} disabled={!selectedCp || busy === "connect"} className="flex-1">
                      {busy === "connect" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plug className="h-4 w-4 mr-1" />}
                      Verbinden
                    </Button>
                  ) : (
                    <Button onClick={handleDisconnect} variant="destructive" className="flex-1">
                      <Power className="h-4 w-4 mr-1" /> Trennen
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Identity */}
            <Card style={{ backgroundColor: `hsl(var(--sa-card))`, borderColor: `hsl(var(--sa-border))` }}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><RadioTower className="h-4 w-4" /> Boot &amp; Identität</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Vendor</Label><Input value={vendor} onChange={(e) => setVendor(e.target.value)} /></div>
                  <div><Label className="text-xs">Model</Label><Input value={model} onChange={(e) => setModel(e.target.value)} /></div>
                  <div><Label className="text-xs">Serial</Label><Input value={serial} onChange={(e) => setSerial(e.target.value)} /></div>
                  <div><Label className="text-xs">Firmware</Label><Input value={firmware} onChange={(e) => setFirmware(e.target.value)} /></div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={sendBoot} disabled={!isConnected || !!busy} className="flex-1">
                    {busy === "Boot" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                    BootNotification
                  </Button>
                  <Button onClick={sendHeartbeat} disabled={!isConnected || !!busy} variant="outline">
                    {busy === "Heartbeat" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Heart className="h-4 w-4 mr-1" />}
                    Heartbeat
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Status */}
            <Card style={{ backgroundColor: `hsl(var(--sa-card))`, borderColor: `hsl(var(--sa-border))` }}>
              <CardHeader>
                <CardTitle className="text-base">StatusNotification</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Connector</Label>
                    <Input type="number" min={1} value={connectorId} onChange={(e) => setConnectorId(Math.max(1, parseInt(e.target.value) || 1))} />
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={statusValue} onValueChange={setStatusValue}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Error</Label>
                    <Select value={errorCode} onValueChange={setErrorCode}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ERROR_CODES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={sendStatus} disabled={!isConnected || !!busy} className="w-full">
                  {busy === "Status" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                  Status senden
                </Button>
              </CardContent>
            </Card>

            {/* Transaction */}
            <Card style={{ backgroundColor: `hsl(var(--sa-card))`, borderColor: `hsl(var(--sa-border))` }}>
              <CardHeader>
                <CardTitle className="text-base">Ladevorgang</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1"><Label className="text-xs">idTag</Label><Input value={idTag} onChange={(e) => setIdTag(e.target.value)} /></div>
                  <div><Label className="text-xs">Leistung (kW)</Label><Input type="number" min={1} max={350} value={powerKw} onChange={(e) => setPowerKw(parseFloat(e.target.value) || 11)} /></div>
                  <div><Label className="text-xs">MeterValue (s)</Label><Input type="number" min={5} value={meterValuesIntervalSec} onChange={(e) => setMeterValuesIntervalSec(parseInt(e.target.value) || 60)} /></div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={startTx} disabled={!isConnected || !!busy} className="flex-1">
                    {busy === "Start" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                    StartTransaction
                  </Button>
                  <Button onClick={stopTx} disabled={!isConnected || !!busy} variant="outline" className="flex-1">
                    {busy === "Stop" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Square className="h-4 w-4 mr-1" />}
                    StopTransaction
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Custom frame */}
          <Card style={{ backgroundColor: `hsl(var(--sa-card))`, borderColor: `hsl(var(--sa-border))` }}>
            <CardHeader>
              <CardTitle className="text-base">Manueller Frame (Experten)</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Input value={customFrame} onChange={(e) => setCustomFrame(e.target.value)} className="font-mono text-xs" />
              <Button onClick={sendCustom} disabled={!isConnected || !!busy} variant="outline">
                <Send className="h-4 w-4 mr-1" /> Senden
              </Button>
            </CardContent>
          </Card>

          {/* Live log */}
          <Card style={{ backgroundColor: `hsl(var(--sa-card))`, borderColor: `hsl(var(--sa-border))` }}>
            <CardHeader>
              <CardTitle className="text-base">Live-Frame-Log</CardTitle>
            </CardHeader>
            <CardContent>
              <OcppFrameLog entries={logEntries} onClear={() => setLogEntries([])} />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminOcppSimulator;
