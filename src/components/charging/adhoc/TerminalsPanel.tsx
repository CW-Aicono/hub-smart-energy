import { useState } from "react";
import { useAdhocTerminals, useAdhocProviders } from "@/hooks/useAdhocPayment";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Link as LinkIcon, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { RowActions } from "@/components/ui/row-actions";

const TERMINAL_MODELS = ["CCV Edge IM15", "CCV Edge IM25", "CCV Edge IM30", "Nayax VPOS", "Payter P66", "Anderes"];

export default function TerminalsPanel() {
  const { tenant } = useTenant();
  const { data: terminals = [], isLoading, upsert, remove, assignChargePoint, unassignChargePoint } = useAdhocTerminals();
  const { data: providers = [] } = useAdhocProviders();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [assignFor, setAssignFor] = useState<any>(null);

  const { data: chargePoints = [] } = useQuery({
    queryKey: ["cp-list-min", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("charge_points").select("id, name, ocpp_id, connector_count, location_id").eq("tenant_id", tenant!.id).order("name");
      if (error) throw error;
      return data;
    },
  });

  const openNew = () => {
    setEditing({ provider_id: providers[0]?.id ?? "", terminal_serial: "", terminal_model: "CCV Edge IM30", status: "unknown", notes: "" });
    setOpen(true);
  };

  const save = async () => {
    if (!editing.provider_id || !editing.terminal_serial) return;
    await upsert.mutateAsync(editing);
    setOpen(false);
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Karten-Terminals</h3>
            <p className="text-sm text-muted-foreground">
              Physische Bezahl-Terminals. Ein Terminal kann einem oder mehreren Ladepunkten zugeordnet werden
              (Multi-Charger-Setup wird unterstützt).
            </p>
          </div>
          <Button onClick={openNew} size="sm" disabled={providers.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> Neues Terminal
          </Button>
        </div>

        {providers.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Bitte zuerst einen PSP-Provider konfigurieren.
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : terminals.length === 0 && providers.length > 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Noch keine Terminals angelegt.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seriennummer</TableHead>
                <TableHead>Modell</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Zuordnungen</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {terminals.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">
                    <button type="button" onClick={() => { setEditing({ ...t }); setOpen(true); }} className="text-left hover:underline focus:outline-none focus-visible:underline">
                      {t.terminal_serial}
                    </button>
                  </TableCell>
                  <TableCell>{t.terminal_model || "—"}</TableCell>
                  <TableCell>
                    <span className="text-sm">{t.provider?.display_name}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(t.assignments ?? []).length === 0 ? (
                        <span className="text-xs text-muted-foreground">keine</span>
                      ) : (
                        t.assignments.map((a: any) => (
                          <Badge key={a.id} variant="secondary" className="gap-1">
                            {a.charge_points?.name ?? a.charge_point_id.slice(0, 6)}
                            {a.connector_id ? ` · C${a.connector_id}` : ""}
                            <button
                              type="button"
                              onClick={() => unassignChargePoint.mutate(a.id)}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.status === "online" ? "default" : t.status === "offline" ? "destructive" : "outline"}>
                      {t.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      items={[
                        { label: "Ladepunkt zuordnen", icon: LinkIcon, onClick: () => setAssignFor(t) },
                        { label: "Bearbeiten", icon: Pencil, onClick: () => { setEditing({ ...t }); setOpen(true); } },
                        {
                          label: "Löschen",
                          icon: Trash2,
                          variant: "destructive",
                          onClick: () => confirm("Terminal löschen?") && remove.mutate(t.id),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Edit/Create dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing?.id ? "Terminal bearbeiten" : "Neues Terminal"}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="grid gap-3 py-2">
                <div className="grid gap-1.5">
                  <Label>Provider</Label>
                  <Select value={editing.provider_id} onValueChange={(v) => setEditing({ ...editing, provider_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Provider wählen" /></SelectTrigger>
                    <SelectContent>
                      {providers.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Seriennummer *</Label>
                    <Input value={editing.terminal_serial} onChange={(e) => setEditing({ ...editing, terminal_serial: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Modell</Label>
                    <Select value={editing.terminal_model ?? ""} onValueChange={(v) => setEditing({ ...editing, terminal_model: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TERMINAL_MODELS.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Notizen</Label>
                  <Textarea value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
              <Button onClick={save} disabled={upsert.isPending || !editing?.provider_id || !editing?.terminal_serial}>Speichern</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign CP dialog */}
        <Dialog open={!!assignFor} onOpenChange={(o) => !o && setAssignFor(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Ladepunkt zuordnen — {assignFor?.terminal_serial}</DialogTitle>
            </DialogHeader>
            <AssignForm
              chargePoints={chargePoints as any[]}
              onSubmit={async (payload) => {
                await assignChargePoint.mutateAsync({ terminal_id: assignFor.id, ...payload });
                setAssignFor(null);
              }}
              onCancel={() => setAssignFor(null)}
            />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function AssignForm({ chargePoints, onSubmit, onCancel }: { chargePoints: any[]; onSubmit: (p: any) => Promise<void>; onCancel: () => void }) {
  const [cpId, setCpId] = useState<string>("");
  const [conn, setConn] = useState<string>("");
  const [primary, setPrimary] = useState(false);
  const selected = chargePoints.find((c) => c.id === cpId);

  return (
    <div className="grid gap-3 py-2">
      <div className="grid gap-1.5">
        <Label>Ladepunkt</Label>
        <Select value={cpId} onValueChange={setCpId}>
          <SelectTrigger><SelectValue placeholder="Ladepunkt wählen" /></SelectTrigger>
          <SelectContent>
            {chargePoints.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name} ({c.ocpp_id})</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      {selected && (selected.connector_count ?? 0) > 1 && (
        <div className="grid gap-1.5">
          <Label>Connector (optional)</Label>
          <Select value={conn} onValueChange={setConn}>
            <SelectTrigger><SelectValue placeholder="Alle" /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: selected.connector_count }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>Connector {n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} />
        Primäres Terminal für diesen Ladepunkt
      </label>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Abbrechen</Button>
        <Button disabled={!cpId} onClick={() => onSubmit({ charge_point_id: cpId, connector_id: conn ? Number(conn) : null, is_primary: primary })}>Zuordnen</Button>
      </DialogFooter>
    </div>
  );
}
