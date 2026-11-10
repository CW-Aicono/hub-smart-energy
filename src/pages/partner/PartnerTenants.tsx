import { sendHandoverInvite } from "@/lib/handoverInvite";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, LifeBuoy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerAccess } from "@/hooks/usePartnerAccess";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { beginImpersonation } from "@/lib/supportView";
import { useTenantOptional } from "@/hooks/useTenant";
import { setAreaPreference } from "@/lib/areaPreference";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";
import { loadPartnerTenants } from "@/lib/partnerTenantList";
import { useTranslation } from "@/hooks/useTranslation";

interface Row {
  id: string;
  name: string | null;
  slug: string;
  contact_email: string | null;
  created_at: string;
  setup_status?: string | null;
}

type SortKey = "name" | "slug" | "contact" | "created_at";

const slugify = (s: string) =>
  s.toLowerCase()
    .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" }[c] || c))
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function PartnerTenants() {
  const { partnerId, isPartnerAdmin, permissions } = usePartnerAccess();
  const canCreate = permissions.createTenant;
  const { toast } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ownTenantId = useTenantOptional()?.tenant?.id ?? null;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = rows.filter((r) =>
    (r.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    r.slug.toLowerCase().includes(search.toLowerCase()),
  );

  const { sorted, sort, toggle } = useSortableData<Row, SortKey>(filtered, (r, k) => {
    switch (k) {
      case "name": return r.name ?? "";
      case "slug": return r.slug;
      case "contact": return r.contact_email ?? "";
      case "created_at": return r.created_at ? new Date(r.created_at) : null;
      default: return null;
    }
  }, { key: "name", direction: "asc" });

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");

  // Remote support
  const [startingSupportFor, setStartingSupportFor] = useState<string | null>(null);

  const load = async () => {
    if (!partnerId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      setRows(await loadPartnerTenants(partnerId));
    } catch {
      setRows([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [partnerId]);

  const resetForm = () => {
    setName(""); setSlug(""); setContactEmail(""); setAdminEmail(""); setAdminName("");
  };

  const handleCreate = async () => {
    if (!name || !slug) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("partner-create-tenant", {
        body: { name, slug, contact_email: contactEmail || null, handover_admin_email: adminEmail || null, handover_admin_name: adminName || null },
      });
      const res: any = typeof data === "string" ? JSON.parse(data) : data;
      if (error || !res?.success) throw new Error(res?.error || error?.message || "Anlage fehlgeschlagen");

      toast({
        title: "Tenant angelegt",
        description: adminEmail
          ? `${adminEmail} erhält die Zugangsmail, sobald Sie auf „Übergeben“ klicken.`
          : "Tenant angelegt. Admin-Einladung kann später erfolgen.",
      });
      setCreateOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message ?? "Unbekannt", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleCompleteSetup = async (tenantId: string) => {
    if (!window.confirm("Einrichtung abschließen und an den Kunden übergeben? Der Kunden-Admin erhält jetzt seine Zugangsmail. Danach ist Fernzugriff nur noch mit Freigabe des Kunden möglich.")) return;
    const { error } = await supabase.rpc("complete_tenant_setup" as any, { _tenant_id: tenantId } as any);
    if (error) { toast({ title: "Übergabe fehlgeschlagen", description: error.message, variant: "destructive" }); return; }
    const msg = await sendHandoverInvite(tenantId);
    toast(msg.ok ? { title: "Tenant übergeben", description: msg.text } : { title: "Tenant übergeben – Zugangsmail fehlgeschlagen", description: msg.text, variant: "destructive" });
    await load();
  };

  const handleStartRemoteSupport = async (tenantId: string) => {
    // Eigener Tenant: direkt öffnen, keine Remote-Sitzung nötig.
    if (ownTenantId && ownTenantId === tenantId) {
      setAreaPreference("ems");
      navigate("/", { replace: true });
      return;
    }
    setStartingSupportFor(tenantId);
    try {
      const { data: cur } = await supabase.auth.getSession();
      if (!cur.session) throw new Error("Keine aktive Session");
      const original = {
        access_token: cur.session.access_token,
        refresh_token: cur.session.refresh_token,
      };
      const { data: imp, error: impErr } = await supabase.functions.invoke(
        "support-session-impersonate",
        { body: { target_tenant_id: tenantId, reason: "Partner Remote-Support" } },
      );
      if (impErr) {
        let msg = impErr.message;
        try { msg = (await (impErr as any)?.context?.json())?.error ?? msg; } catch { /* noop */ }
        if ((impErr as any)?.context?.status === 403) msg = "Der Tenant hat Remote-Support nicht freigegeben. " + (msg ?? "");
        throw new Error(msg);
      }
      if (!imp?.access_token) throw new Error(imp?.error || "Impersonation fehlgeschlagen");
      beginImpersonation({
        sessionId: imp.session_id,
        tenantId,
        originalSession: original,
      });
      const { error: setErr } = await supabase.auth.setSession({
        access_token: imp.access_token,
        refresh_token: imp.refresh_token,
      });
      if (setErr) throw setErr;
      navigate("/");
    } catch (e: any) {
      toast({ title: "Remote-Support fehlgeschlagen", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setStartingSupportFor(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Meine Tenants</h1>
          <p className="text-muted-foreground">Alle Tenants, die diesem Partner zugeordnet sind.</p>
        </div>
        {canCreate && (
          <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Neuer Tenant</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Neuen Tenant anlegen</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    value={name}
                    onChange={(e) => {
                      const v = e.target.value;
                      setName(v);
                      if (!slug || slug === slugify(name)) setSlug(slugify(v));
                    }}
                    placeholder="Mustermann GmbH"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug *</Label>
                  <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="mustermann-gmbh" />
                  <p className="text-xs text-muted-foreground">a–z, 0–9, „-". Wird automatisch befüllt.</p>
                </div>
                <div className="space-y-2">
                  <Label>Kontakt-E-Mail (optional)</Label>
                  <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="info@firma.de" />
                </div>
                <div className="border-t my-2" />
                <p className="text-xs text-muted-foreground">
                  Optional: Tenant-Admin hinterlegen. Er erhält seine Zugangsmail erst, wenn Sie auf „Übergeben“ klicken.
                </p>
                <div className="space-y-2">
                  <Label>E-Mail Tenant-Admin</Label>
                  <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@firma.de" />
                </div>
                <div className="space-y-2">
                  <Label>Name Tenant-Admin</Label>
                  <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Max Mustermann" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
                <Button onClick={handleCreate} disabled={creating || !name || !slug}>
                  {creating ? "Wird angelegt…" : "Anlegen"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Tenant-Liste</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Suche nach Name oder Slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          {loading ? (
            <p className="text-sm text-muted-foreground">Lade…</p>
          ) : loadError ? (
            <div role="alert" className="flex items-center gap-3 flex-wrap">
              <p className="text-sm text-destructive">{t("partner.tenants.loadError")}</p>
              <Button variant="outline" size="sm" onClick={load}>{t("partner.tenants.retry")}</Button>
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Tenants gefunden.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Name" sortKey="name" sort={sort} onToggle={toggle} />
                  <SortableHead label="Slug" sortKey="slug" sort={sort} onToggle={toggle} />
                  <SortableHead label="Kontakt" sortKey="contact" sort={sort} onToggle={toggle} />
                  <SortableHead label="Erstellt" sortKey="created_at" sort={sort} onToggle={toggle} />
                  <TableCell className="w-40 text-right">Aktionen</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => navigate(`/partner/tenants/${r.id}`)}
                  >
                    <TableCell className="font-medium">
                      {r.name ?? "—"}
                      {r.setup_status === "setup" && (
                        <Badge variant="secondary" className="ml-2">In Einrichtung</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.slug}</TableCell>
                    <TableCell className="text-muted-foreground">{r.contact_email ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("de-DE")}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {isPartnerAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStartRemoteSupport(r.id)}
                          disabled={startingSupportFor === r.id}
                        >
                          {startingSupportFor === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <LifeBuoy className="h-3.5 w-3.5 mr-1" />
                          )}
                          {r.setup_status === "setup" ? "Einrichtung öffnen" : "EMS öffnen"}
                        </Button>
                      )}
                      {isPartnerAdmin && r.setup_status === "setup" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-1"
                          onClick={() => handleCompleteSetup(r.id)}
                        >
                          Übergeben
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
