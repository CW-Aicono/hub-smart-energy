import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { beginImpersonation } from "@/lib/supportView";

interface Row {
  id: string;
  name: string | null;
  slug: string;
  contact_email: string | null;
  created_at: string;
}

const slugify = (s: string) =>
  s.toLowerCase()
    .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" }[c] || c))
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function PartnerTenants() {
  const { partnerId, isPartnerAdmin } = usePartnerAccess();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("tenants")
      .select("id, name, slug, contact_email, created_at")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false });
    setRows((data as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  const resetForm = () => {
    setName(""); setSlug(""); setContactEmail(""); setAdminEmail(""); setAdminName("");
  };

  const handleCreate = async () => {
    if (!name || !slug) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("partner-create-tenant", {
        body: { name, slug, contact_email: contactEmail || null },
      });
      const res: any = typeof data === "string" ? JSON.parse(data) : data;
      if (error || !res?.success) throw new Error(res?.error || error?.message || "Anlage fehlgeschlagen");

      // Optional: Tenant-Admin einladen
      if (adminEmail) {
        const { data: invD, error: invE } = await supabase.functions.invoke("invite-tenant-admin", {
          body: {
            tenantId: res.tenant.id,
            adminEmail,
            adminName: adminName || undefined,
            redirectTo: "https://ems-pro.aicono.org/set-password",
          },
        });
        const invRes: any = typeof invD === "string" ? JSON.parse(invD) : invD;
        if (invE || !invRes?.success) {
          // Tenant ist angelegt; nur Einladung scheiterte → klare Meldung
          throw new Error(invRes?.error || invE?.message || "Einladung fehlgeschlagen");
        }
      }

      toast({
        title: "Tenant angelegt",
        description: adminEmail
          ? `Eine Einladungsmail wurde an ${adminEmail} gesendet.`
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

  const handleStartRemoteSupport = async (tenantId: string) => {
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
      if (impErr) throw impErr;
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

  const filtered = rows.filter((r) =>
    (r.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    r.slug.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Meine Tenants</h1>
          <p className="text-muted-foreground">Alle Mandanten, die diesem Partner zugeordnet sind.</p>
        </div>
        {isPartnerAdmin && (
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
                  Optional: Tenant-Administrator direkt einladen. Lassen Sie die Felder leer, wenn die Einladung später erfolgen soll.
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
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Tenants gefunden.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Kontakt</TableHead>
                  <TableHead>Erstellt</TableHead>
                  <TableHead className="w-40 text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.slug}</TableCell>
                    <TableCell className="text-muted-foreground">{r.contact_email ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("de-DE")}
                    </TableCell>
                    <TableCell className="text-right">
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
                          Remote-Support
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
