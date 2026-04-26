import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useTenants } from "@/hooks/useTenants";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/invokeWithRetry";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Play,
  Square,
  Plug,
  RefreshCw,
  Zap,
  ZapOff,
  Loader2,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";

interface SimulatorRow {
  id: string;
  tenant_id: string;
  external_id: string | null;
  ocpp_id: string;
  protocol: "ws" | "wss";
  vendor: string;
  model: string;
  status: string;
  last_error: string | null;
  started_at: string;
  stopped_at: string | null;
  charge_point_id: string | null;
  live_status: string | null;
  live_meter_wh: number | null;
  live_transaction_id: number | null;
  live_last_error: string | null;
}

const statusVariant = (
  status: string,
): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "charging") return "default";
  if (status === "online") return "secondary";
  if (status === "error") return "destructive";
  return "outline";
};

const SuperAdminSimulators = () => {
  const { user, loading } = useAuth();
  const { tenants } = useTenants();
  const qc = useQueryClient();

  const [openStart, setOpenStart] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [vendor, setVendor] = useState("AICONO");
  const [model, setModel] = useState("Simulator");
  const [protocol, setProtocol] = useState<"ws" | "wss">("wss");

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["simulator-instances"],
    queryFn: async () => {
      const { data, error } = await invokeWithRetry(
        "ocpp-simulator-control?action=status",
        { },
      );
      if (error) throw error;
      return (data as { instances: SimulatorRow[] }).instances ?? [];
    },
    refetchInterval: 5000,
  });

  const startMut = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Tenant erforderlich");
      const { data, error } = await invokeWithRetry(
        "ocpp-simulator-control?action=start",
        { body: { tenantId, vendor, model, protocol } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Simulator gestartet");
      setOpenStart(false);
      qc.invalidateQueries({ queryKey: ["simulator-instances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const actionMut = useMutation({
    mutationFn: async (vars: {
      instanceId: string;
      action: "startTx" | "stopTx";
    }) => {
      const { data, error } = await invokeWithRetry(
        "ocpp-simulator-control?action=action",
        { body: { instanceId: vars.instanceId, action: vars.action } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Aktion gesendet");
      qc.invalidateQueries({ queryKey: ["simulator-instances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stopMut = useMutation({
    mutationFn: async (instanceId: string) => {
      const { data, error } = await invokeWithRetry(
        "ocpp-simulator-control?action=stop",
        { body: { instanceId } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Simulator gestoppt");
      qc.invalidateQueries({ queryKey: ["simulator-instances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const tenantName = (id: string) =>
    tenants.find((t) => t.id === id)?.name || id.slice(0, 8);

  return (
    <div className="flex h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Wallbox-Simulator</h1>
              <p className="text-sm text-muted-foreground">
                Virtuelle OCPP-1.6-Wallboxen für End-to-End-Tests des
                OCPP-Servers, der Charge-Point-Logik und der Abrechnung.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`}
                />
                Aktualisieren
              </Button>
              <Dialog open={openStart} onOpenChange={setOpenStart}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Play className="h-4 w-4 mr-2" />
                    Simulator starten
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Neuen Simulator starten</DialogTitle>
                    <DialogDescription>
                      Erstellt automatisch einen Charge-Point-Eintrag und
                      startet eine virtuelle Wallbox auf dem Hetzner-Container.
                      Maximal 3 aktive pro Tenant.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label>Tenant</Label>
                      <Select value={tenantId} onValueChange={setTenantId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Tenant auswählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {tenants.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Hersteller</Label>
                        <Input
                          value={vendor}
                          onChange={(e) => setVendor(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Modell</Label>
                        <Input
                          value={model}
                          onChange={(e) => setModel(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Protokoll</Label>
                      <Select
                        value={protocol}
                        onValueChange={(v) =>
                          setProtocol(v as "ws" | "wss")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="wss">wss (TLS)</SelectItem>
                          <SelectItem value="ws">ws (unverschlüsselt)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setOpenStart(false)}
                    >
                      Abbrechen
                    </Button>
                    <Button
                      onClick={() => startMut.mutate()}
                      disabled={!tenantId || startMut.isPending}
                    >
                      {startMut.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Starten
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plug className="h-5 w-5" />
                Aktive & vergangene Instanzen
              </CardTitle>
              <CardDescription>
                Live-Status wird alle 5 Sekunden mit dem Hetzner-Container
                synchronisiert.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!data || data.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Noch keine Simulator-Instanzen vorhanden.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>OCPP-ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Zähler (kWh)</TableHead>
                      <TableHead>Tx-ID</TableHead>
                      <TableHead>Gestartet</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((row) => {
                      const live = row.live_status ?? row.status;
                      const isActive = !["stopped", "error"].includes(live);
                      const isCharging = live === "charging";
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">
                            {tenantName(row.tenant_id)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.ocpp_id}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(live)}>{live}</Badge>
                            {row.live_last_error && (
                              <p className="text-xs text-destructive mt-1">
                                {row.live_last_error}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {row.live_meter_wh != null
                              ? (row.live_meter_wh / 1000).toFixed(2)
                              : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.live_transaction_id ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(row.started_at), "dd.MM. HH:mm")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              {isActive && !isCharging && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    actionMut.mutate({
                                      instanceId: row.id,
                                      action: "startTx",
                                    })
                                  }
                                  disabled={actionMut.isPending}
                                >
                                  <Zap className="h-3 w-3 mr-1" />
                                  Laden
                                </Button>
                              )}
                              {isCharging && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    actionMut.mutate({
                                      instanceId: row.id,
                                      action: "stopTx",
                                    })
                                  }
                                  disabled={actionMut.isPending}
                                >
                                  <ZapOff className="h-3 w-3 mr-1" />
                                  Stop Tx
                                </Button>
                              )}
                              {isActive && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => stopMut.mutate(row.id)}
                                  disabled={stopMut.isPending}
                                >
                                  <Square className="h-3 w-3 mr-1" />
                                  Stoppen
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminSimulators;
