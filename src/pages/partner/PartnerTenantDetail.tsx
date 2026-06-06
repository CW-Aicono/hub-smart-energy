import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerAccess } from "@/hooks/usePartnerAccess";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Pencil, Building2, MapPin, Package, Activity } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const statusColor: Record<string, string> = {
  active: "default",
  suspended: "secondary",
  deleted: "destructive",
};

export default function PartnerTenantDetail() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { partnerId, permissions, loading: accessLoading } = usePartnerAccess();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["partner-tenant-detail", tenantId],
    enabled: !!tenantId && !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenantId!)
        .eq("partner_id", partnerId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["partner-tenant-locations", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("locations")
        .select("id, name, city, postal_code, created_at")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const { data: licenses = [] } = useQuery({
    queryKey: ["partner-tenant-licenses", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenant_licenses")
        .select("id, plan_name, price_monthly, status, valid_from, valid_until")
        .eq("tenant_id", tenantId!);
      return (data ?? []) as any[];
    },
  });

  const { data: modules = [] } = useQuery({
    queryKey: ["partner-tenant-modules", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenant_modules")
        .select("module_code, is_enabled, enabled_at")
        .eq("tenant_id", tenantId!)
        .eq("is_enabled", true);
      return (data ?? []) as any[];
    },
  });

  if (isLoading || accessLoading) return <div className="p-6 text-muted-foreground">Lädt…</div>;
  if (!tenant) return <div className="p-6 text-muted-foreground">Tenant nicht gefunden oder kein Zugriff.</div>;

  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("de-DE") : "—");
  const fmtEur = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/partner/tenants"><ArrowLeft className="h-4 w-4 mr-1" /> Zurück</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              {tenant.name}
              <Badge variant={(statusColor[tenant.status] as any) || "outline"}>{tenant.status}</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">Slug: {tenant.slug}</p>
          </div>
        </div>
        {permissions.createTenant && (
          <Button onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4 mr-2" /> Bearbeiten</Button>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="locations">Standorte ({locations.length})</TabsTrigger>
          <TabsTrigger value="modules">Module & Lizenzen</TabsTrigger>
          <TabsTrigger value="activity">Aktivität</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Stammdaten</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Name" value={tenant.name} />
              <Field label="Kontaktperson" value={tenant.contact_person} />
              <Field label="Kontakt-E-Mail" value={tenant.contact_email} />
              <Field label="Telefon" value={tenant.contact_phone} />
              <Field label="Straße" value={tenant.street ? `${tenant.street} ${tenant.house_number ?? ""}` : null} />
              <Field label="Ort" value={tenant.postal_code ? `${tenant.postal_code} ${tenant.city ?? ""}` : tenant.city} />
              <Field label="Typ" value={tenant.tenant_type} />
              <Field label="Status" value={tenant.status} />
              <Field label="Erstellt am" value={fmtDate(tenant.created_at)} />
              <Field label="Onboarding" value={tenant.onboarding_completed ? "abgeschlossen" : "offen"} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Standorte</CardTitle></CardHeader>
            <CardContent>
              {locations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine Standorte angelegt.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Ort</TableHead><TableHead>Erstellt</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {locations.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.name}</TableCell>
                        <TableCell>{l.postal_code} {l.city}</TableCell>
                        <TableCell className="text-muted-foreground">{fmtDate(l.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modules" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> Aktive Module ({modules.length})</CardTitle></CardHeader>
            <CardContent>
              {modules.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Module aktiviert.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {modules.map((m) => (
                    <Badge key={m.module_code} variant="secondary">{m.module_code}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Lizenzen</CardTitle></CardHeader>
            <CardContent>
              {licenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Lizenzen hinterlegt.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Plan</TableHead><TableHead>Preis/Monat</TableHead><TableHead>Status</TableHead>
                    <TableHead>Gültig ab</TableHead><TableHead>Gültig bis</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {licenses.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.plan_name}</TableCell>
                        <TableCell>{fmtEur(Number(l.price_monthly))}</TableCell>
                        <TableCell><Badge variant={l.status === "active" ? "default" : "outline"}>{l.status}</Badge></TableCell>
                        <TableCell>{fmtDate(l.valid_from)}</TableCell>
                        <TableCell>{fmtDate(l.valid_until)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> Aktivität</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Tenant angelegt am {fmtDate(tenant.created_at)}.</p>
              {tenant.suspended_at && <p>Gesperrt am {fmtDate(tenant.suspended_at)} — Grund: {tenant.suspended_reason ?? "—"}</p>}
              {tenant.deleted_at && <p>Archiviert am {fmtDate(tenant.deleted_at)}.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        tenant={tenant}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["partner-tenant-detail", tenantId] });
          qc.invalidateQueries({ queryKey: ["partner-tenants"] });
        }}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value ?? "—"}</p>
    </div>
  );
}

function EditDialog({
  open, onOpenChange, tenant, onSaved,
}: { open: boolean; onOpenChange: (b: boolean) => void; tenant: any; onSaved: () => void }) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        name: tenant.name ?? "",
        contact_person: tenant.contact_person ?? "",
        contact_email: tenant.contact_email ?? "",
        contact_phone: tenant.contact_phone ?? "",
        street: tenant.street ?? "",
        house_number: tenant.house_number ?? "",
        postal_code: tenant.postal_code ?? "",
        city: tenant.city ?? "",
        address: tenant.address ?? "",
      });
    }
  }, [open, tenant]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("tenants").update(form).eq("id", tenant.id);
      if (error) throw error;
      toast({ title: "Tenant gespeichert" });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Tenant bearbeiten</DialogTitle></DialogHeader>
        <CardDescription>
          Status, Lifecycle und Abrechnungs-Felder sind dem Super-Admin vorbehalten.
        </CardDescription>
        <div className="grid md:grid-cols-2 gap-3 pt-2">
          <div className="md:col-span-2 space-y-2"><Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Kontaktperson</Label>
            <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
          <div className="space-y-2"><Label>Kontakt-E-Mail</Label>
            <Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
          <div className="space-y-2"><Label>Telefon</Label>
            <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
          <div className="space-y-2"><Label>Straße</Label>
            <Input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} /></div>
          <div className="space-y-2"><Label>Hausnummer</Label>
            <Input value={form.house_number} onChange={(e) => setForm({ ...form, house_number: e.target.value })} /></div>
          <div className="space-y-2"><Label>PLZ</Label>
            <Input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} /></div>
          <div className="space-y-2"><Label>Ort</Label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div className="md:col-span-2 space-y-2"><Label>Notiz / Adresszusatz</Label>
            <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Speichere…" : "Speichern"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
