import { useState } from "react";
import { useAdhocProviders } from "@/hooks/useAdhocPayment";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { RowActions } from "@/components/ui/row-actions";

const PROVIDER_TYPES = [
  { value: "ccv", label: "CCV Cloud-Connect" },
  { value: "nayax", label: "Nayax" },
  { value: "payter", label: "Payter" },
  { value: "adyen", label: "Adyen" },
  { value: "other", label: "Mock / Andere (Test)" },
];

export default function ProvidersPanel() {
  const { data: providers = [], isLoading, upsert, remove } = useAdhocProviders();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const openNew = () => {
    setEditing({
      provider_type: "other",
      display_name: "Mock-Provider (Test)",
      environment: "sandbox",
      base_url: "",
      party_id: "",
      country_code: "DE",
      is_active: true,
      config: {},
    });
    setOpen(true);
  };

  const openEdit = (p: any) => {
    setEditing({ ...p });
    setOpen(true);
  };

  const save = async () => {
    await upsert.mutateAsync(editing);
    setOpen(false);
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">PSP-Verbindungen</h3>
            <p className="text-sm text-muted-foreground">
              Zahlungsdienstleister (PSP) für Ad-Hoc-Kartenzahlungen. Ohne echten CCV-Sandbox-Zugang kann
              der eingebaute Mock-Adapter für End-to-End-Tests verwendet werden.
            </p>
          </div>
          <Button onClick={openNew} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Neuer Provider
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : providers.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Noch kein Provider konfiguriert. Beginnen Sie mit dem Mock-Provider für Testzwecke.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Umgebung</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <button type="button" onClick={() => openEdit(p)} className="text-left font-medium hover:underline focus:outline-none focus-visible:underline">
                      {p.display_name}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{PROVIDER_TYPES.find((t) => t.value === p.provider_type)?.label ?? p.provider_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.environment === "production" ? "default" : "secondary"}>
                      {p.environment === "production" ? "Live" : "Sandbox"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {p.is_active ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-sm">
                        <CheckCircle2 className="h-4 w-4" /> Aktiv
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">Inaktiv</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      items={[
                        { label: "Bearbeiten", icon: Pencil, onClick: () => openEdit(p) },
                        {
                          label: "Löschen",
                          icon: Trash2,
                          variant: "destructive",
                          onClick: () => confirm("Provider wirklich löschen?") && remove.mutate(p.id),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing?.id ? "Provider bearbeiten" : "Neuer Provider"}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="grid gap-3 py-2">
                <div className="grid gap-1.5">
                  <Label>Anzeigename</Label>
                  <Input value={editing.display_name} onChange={(e) => setEditing({ ...editing, display_name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Provider-Typ</Label>
                    <Select value={editing.provider_type} onValueChange={(v) => setEditing({ ...editing, provider_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PROVIDER_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Umgebung</Label>
                    <Select value={editing.environment} onValueChange={(v) => setEditing({ ...editing, environment: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sandbox">Sandbox / Test</SelectItem>
                        <SelectItem value="production">Live</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Party-ID (OCPI)</Label>
                    <Input value={editing.party_id ?? ""} onChange={(e) => setEditing({ ...editing, party_id: e.target.value })} placeholder="z. B. AIC" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Land</Label>
                    <Input value={editing.country_code ?? ""} onChange={(e) => setEditing({ ...editing, country_code: e.target.value })} placeholder="DE" />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Base-URL</Label>
                  <Input value={editing.base_url ?? ""} onChange={(e) => setEditing({ ...editing, base_url: e.target.value })} placeholder="https://…" />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                  <Label>Aktiv</Label>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
              <Button onClick={save} disabled={upsert.isPending}>Speichern</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
