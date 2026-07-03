import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Briefcase, Loader2, Plus, Mail, Users, AlertCircle, CheckCircle2, Send } from "lucide-react";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { AuditLogList } from "@/components/audit/AuditLogList";
import { writeAuditLog } from "@/lib/auditLog";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";

interface Partner {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  custom_domain: string | null;
  contact_email: string | null;
  is_active: boolean;
  billing_mode: string;
  commission_pct: number | null;
  white_label_enabled: boolean | null;
  brand_display_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  support_email: string | null;
  created_at: string;
}

type SortKey = "name" | "slug" | "active" | "created_at";

const normalizeSlug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").slice(0, 50);

const slugifyFromName = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);

export default function SuperAdminPartners() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // Create-Dialog
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [saving, setSaving] = useState(false);

  const [slugStatus, setSlugStatus] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "available" }
    | { kind: "taken" }
    | { kind: "invalid"; message: string }
  >({ kind: "idle" });

  // Invite-Dialog (für neue oder erneute Einladungen)
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePartner, setInvitePartner] = useState<Partner | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteSaving, setInviteSaving] = useState(false);

  // Edit-Dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editPartner, setEditPartner] = useState<Partner | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSubdomain, setEditSubdomain] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editBillingMode, setEditBillingMode] = useState<"wholesale" | "commission">("wholesale");
  const [editCommissionPct, setEditCommissionPct] = useState<string>("20");
  // White-Label (Stage 7)
  const [editWhiteLabel, setEditWhiteLabel] = useState(false);
  const [editBrandDisplayName, setEditBrandDisplayName] = useState("");
  const [editCustomDomain, setEditCustomDomain] = useState("");
  const [editPrimaryColor, setEditPrimaryColor] = useState("");
  const [editSecondaryColor, setEditSecondaryColor] = useState("");
  const [editAccentColor, setEditAccentColor] = useState("");
  const [editSupportEmail, setEditSupportEmail] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editSlugStatus, setEditSlugStatus] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "available" }
    | { kind: "taken" }
    | { kind: "invalid"; message: string }
  >({ kind: "idle" });


  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["super-admin-partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("id, name, slug, subdomain, custom_domain, contact_email, is_active, billing_mode, commission_pct, white_label_enabled, brand_display_name, logo_url, primary_color, secondary_color, accent_color, support_email, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Partner[];
    },
  });

  const { sorted, sort, toggle } = useSortableData<Partner, SortKey>(partners, (r, k) => {
    switch (k) {
      case "name": return r.name;
      case "slug": return r.slug;
      case "active": return r.is_active ? 1 : 0;
      case "created_at": return r.created_at ? new Date(r.created_at) : null;
      default: return null;
    }
  }, { key: "name", direction: "asc" });

  const { data: memberCounts = {} } = useQuery({
    queryKey: ["super-admin-partner-member-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_members")
        .select("partner_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: { partner_id: string }) => {
        counts[r.partner_id] = (counts[r.partner_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  // Debounced Slug-Check (Create)
  useEffect(() => {
    if (!slug) { setSlugStatus({ kind: "idle" }); return; }
    if (!/^[a-z0-9-]{2,50}$/.test(slug) || slug.startsWith("-") || slug.endsWith("-")) {
      setSlugStatus({ kind: "invalid", message: "2–50 Zeichen, nur a–z, 0–9 und '-' (nicht am Anfang/Ende)." });
      return;
    }
    setSlugStatus({ kind: "checking" });
    const handle = setTimeout(async () => {
      const { data } = await supabase.from("partners").select("id").eq("slug", slug).maybeSingle();
      setSlugStatus(data ? { kind: "taken" } : { kind: "available" });
    }, 350);
    return () => clearTimeout(handle);
  }, [slug]);

  // Debounced Slug-Check (Edit)
  useEffect(() => {
    if (!editOpen || !editPartner) { setEditSlugStatus({ kind: "idle" }); return; }
    if (editSlug === editPartner.slug) { setEditSlugStatus({ kind: "available" }); return; }
    if (!editSlug) { setEditSlugStatus({ kind: "idle" }); return; }
    if (!/^[a-z0-9-]{2,50}$/.test(editSlug) || editSlug.startsWith("-") || editSlug.endsWith("-")) {
      setEditSlugStatus({ kind: "invalid", message: "2–50 Zeichen, nur a–z, 0–9 und '-' (nicht am Anfang/Ende)." });
      return;
    }
    setEditSlugStatus({ kind: "checking" });
    const handle = setTimeout(async () => {
      const { data } = await supabase.from("partners").select("id").eq("slug", editSlug).maybeSingle();
      if (data && data.id !== editPartner.id) setEditSlugStatus({ kind: "taken" });
      else setEditSlugStatus({ kind: "available" });
    }, 350);
    return () => clearTimeout(handle);
  }, [editSlug, editOpen, editPartner]);

  const reset = () => {
    setName(""); setSlug(""); setSlugTouched(false);
    setAdminEmail(""); setAdminName("");
    setSlugStatus({ kind: "idle" });
  };

  const createDisabled =
    saving || !name.trim() || !slug.trim() ||
    slugStatus.kind === "checking" || slugStatus.kind === "taken" || slugStatus.kind === "invalid" ||
    (adminEmail.trim() !== "" && !adminEmail.includes("@"));

  const handleCreate = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-partner-admin", {
        body: {
          partnerName: name.trim(),
          partnerSlug: slug.trim(),
          adminEmail: adminEmail.trim().toLowerCase() || undefined,
          adminName: adminName.trim() || undefined,
          redirectTo: `${window.location.origin}/set-password`,
        },
      });
      if (error) throw error;
      const result = typeof data === "string" ? JSON.parse(data) : data;
      if (!result?.success) throw new Error(result?.error || "Anlegen fehlgeschlagen");

      toast({
        title: "Partner angelegt",
        description: result.invited
          ? `Einladung an ${adminEmail} versendet.`
          : "Partner wurde angelegt. Einladung kann später versendet werden.",
      });
      qc.invalidateQueries({ queryKey: ["super-admin-partners"] });
      qc.invalidateQueries({ queryKey: ["super-admin-partner-member-counts"] });
      setOpen(false);
      reset();
    } catch (e) {
      toast({ title: "Fehler", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setSaving(false); }
  };

  const openInviteDialog = (p: Partner, mode: "new" | "resend") => {
    setInvitePartner(p);
    setInviteEmail(p.contact_email ?? "");
    setInviteName("");
    setInviteOpen(true);
  };

  const handleSendInvite = async () => {
    if (!invitePartner) return;
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      toast({ title: "Bitte gültige E-Mail eingeben.", variant: "destructive" });
      return;
    }
    setInviteSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-partner-admin", {
        body: {
          partnerId: invitePartner.id,
          adminEmail: inviteEmail.trim().toLowerCase(),
          adminName: inviteName.trim() || undefined,
          redirectTo: `${window.location.origin}/set-password`,
        },
      });
      if (error) throw error;
      const result = typeof data === "string" ? JSON.parse(data) : data;
      if (!result?.success) throw new Error(result?.error || "Einladung fehlgeschlagen");
      toast({ title: "Einladung versendet", description: `E-Mail an ${inviteEmail}.` });
      qc.invalidateQueries({ queryKey: ["super-admin-partners"] });
      qc.invalidateQueries({ queryKey: ["super-admin-partner-member-counts"] });
      setInviteOpen(false);
      setInvitePartner(null);
    } catch (e) {
      toast({ title: "Fehler", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setInviteSaving(false); }
  };

  const openEditDialog = (p: Partner) => {
    setEditPartner(p);
    setEditName(p.name);
    setEditSlug(p.slug);
    setEditEmail(p.contact_email ?? "");
    setEditSubdomain(p.subdomain ?? "");
    setEditActive(p.is_active);
    setEditBillingMode((p.billing_mode === "commission" ? "commission" : "wholesale"));
    setEditCommissionPct(String(p.commission_pct ?? 20));
    setEditWhiteLabel(p.white_label_enabled ?? false);
    setEditBrandDisplayName(p.brand_display_name ?? "");
    setEditCustomDomain(p.custom_domain ?? "");
    setEditPrimaryColor(p.primary_color ?? "");
    setEditSecondaryColor(p.secondary_color ?? "");
    setEditAccentColor(p.accent_color ?? "");
    setEditSupportEmail(p.support_email ?? "");
    setEditLogoUrl(p.logo_url ?? null);
    setEditSlugStatus({ kind: "available" });
    setEditOpen(true);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editPartner) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Logo zu groß", description: "Max. 2 MB.", variant: "destructive" });
      return;
    }
    setLogoUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${editPartner.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("partner-assets")
        .upload(path, file, { cacheControl: "3600", upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("partner-assets").getPublicUrl(path);
      setEditLogoUrl(pub.publicUrl);
      toast({ title: "Logo hochgeladen" });
    } catch (err) {
      toast({ title: "Upload-Fehler", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  };

  const handleSaveEdit = async () => {
    if (!editPartner) return;
    if (!editName.trim()) {
      toast({ title: "Firmenname darf nicht leer sein.", variant: "destructive" });
      return;
    }
    if (editSlugStatus.kind === "taken" || editSlugStatus.kind === "invalid" || editSlugStatus.kind === "checking") {
      toast({ title: "Slug prüfen", description: "Bitte gültigen, freien Slug wählen.", variant: "destructive" });
      return;
    }
    const pct = parseFloat(editCommissionPct.replace(",", "."));
    if (editBillingMode === "commission" && (isNaN(pct) || pct < 0 || pct > 100)) {
      toast({ title: "Provisionssatz", description: "Bitte einen Wert zwischen 0 und 100 angeben.", variant: "destructive" });
      return;
    }
    const normalizeDomain = (d: string) =>
      d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null;
    setEditSaving(true);
    try {
      const beforeSnapshot = {
        name: editPartner.name,
        slug: editPartner.slug,
        is_active: editPartner.is_active,
        billing_mode: (editPartner as any).billing_mode,
        white_label_enabled: (editPartner as any).white_label_enabled,
      };
      const afterPayload = {
        name: editName.trim(),
        slug: editSlug.trim(),
        contact_email: editEmail.trim().toLowerCase() || null,
        subdomain: editSubdomain.trim() || null,
        is_active: editActive,
        billing_mode: editBillingMode,
        commission_pct: isNaN(pct) ? 20 : pct,
        white_label_enabled: editWhiteLabel,
        brand_display_name: editBrandDisplayName.trim() || null,
        custom_domain: normalizeDomain(editCustomDomain),
        primary_color: editPrimaryColor.trim() || null,
        secondary_color: editSecondaryColor.trim() || null,
        accent_color: editAccentColor.trim() || null,
        support_email: editSupportEmail.trim().toLowerCase() || null,
        logo_url: editLogoUrl,
      };
      const { error } = await supabase
        .from("partners")
        .update(afterPayload)
        .eq("id", editPartner.id);
      if (error) throw error;
      toast({ title: "Partner gespeichert" });
      qc.invalidateQueries({ queryKey: ["super-admin-partners"] });
      writeAuditLog({
        action: "partner.update",
        entity_type: "partner",
        entity_id: editPartner.id,
        entity_label: editPartner.name,
        partner_id: editPartner.id,
        before: beforeSnapshot,
        after: {
          name: afterPayload.name,
          slug: afterPayload.slug,
          is_active: afterPayload.is_active,
          billing_mode: afterPayload.billing_mode,
          white_label_enabled: afterPayload.white_label_enabled,
        },
      });
      setEditOpen(false);
      setEditPartner(null);
    } catch (e) {
      toast({ title: "Fehler", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setEditSaving(false); }
  };


  const toggleActive = useMutation({
    mutationFn: async (p: Partner) => {
      const { error } = await supabase.from("partners").update({ is_active: !p.is_active }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["super-admin-partners"] }),
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto p-3 md:p-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Briefcase className="h-6 w-6" /> Partner
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vertriebspartner anlegen und verwalten. Klick auf den Namen zum Bearbeiten.
          </p>
        </div>

        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Neuen Partner anlegen</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neuen Partner anlegen</DialogTitle>
              <DialogDescription>
                E-Mail ist optional – die Einladung kann auch später versendet werden.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-name">Firmenname *</Label>
                <Input
                  id="p-name"
                  value={name}
                  onChange={(e) => {
                    const v = e.target.value;
                    setName(v);
                    if (!slugTouched) setSlug(slugifyFromName(v));
                  }}
                  placeholder="Mustermann Elektro GmbH"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-slug">Kürzel (Slug) *</Label>
                <Input
                  id="p-slug"
                  value={slug}
                  onChange={(e) => { setSlugTouched(true); setSlug(normalizeSlug(e.target.value)); }}
                  onBlur={(e) => setSlug(e.target.value.replace(/^-+|-+$/g, "").slice(0, 50))}
                  placeholder="mustermann-elektro"
                />
                <div className="text-xs min-h-[1rem]">
                  {slugStatus.kind === "checking" && (
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Prüfe Verfügbarkeit…
                    </span>
                  )}
                  {slugStatus.kind === "available" && <span className="text-green-600 font-medium">✓ Kürzel verfügbar</span>}
                  {slugStatus.kind === "taken" && <span className="text-destructive font-medium">✗ Kürzel bereits vergeben</span>}
                  {slugStatus.kind === "invalid" && <span className="text-destructive font-medium">{slugStatus.message}</span>}
                </div>
              </div>

              <div className="border-t my-2" />
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Partner-Administrator (Optional)</p>

              <div className="space-y-1.5">
                <Label htmlFor="p-admin-email">E-Mail</Label>
                <Input
                  id="p-admin-email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@partner.de"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-admin-name">Name</Label>
                <Input
                  id="p-admin-name"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Max Mustermann"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
              <Button onClick={handleCreate} disabled={createDisabled}>
                {saving ? "Wird angelegt…" : adminEmail ? "Anlegen & Einladen" : "Anlegen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Firma" sortKey="name" sort={sort} onToggle={toggle} />
                <SortableHead label="Slug" sortKey="slug" sort={sort} onToggle={toggle} />
                <TableCell>Mitglieder</TableCell>
                <TableCell>Abrechnung</TableCell>
                <SortableHead label="Aktiv" sortKey="active" sort={sort} onToggle={toggle} />
                <SortableHead label="Angelegt" sortKey="created_at" sort={sort} onToggle={toggle} />
                <TableCell className="w-10"></TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Lade Partner…</TableCell></TableRow>
              ) : sorted.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Keine Partner gefunden.</TableCell></TableRow>
              ) : (
                sorted.map((p) => (
                  <TableRow key={p.id} className="group">
                    <TableCell className="font-medium">
                      <button onClick={() => openEditDialog(p)} className="hover:underline text-left">{p.name}</button>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{p.slug}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{memberCounts[p.id] ?? 0}</span>
                        {(memberCounts[p.id] ?? 0) === 0 && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => openInviteDialog(p, "new")}>
                            <Send className="h-3 w-3 mr-1" /> Einladen
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase font-normal">
                        {p.billing_mode === "wholesale" ? "Wiederverkauf" : `Provision (${p.commission_pct ?? 20}%)`}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <button onClick={() => toggleActive.mutate(p)} disabled={toggleActive.isPending}>
                        <Badge variant={p.is_active ? "default" : "secondary"} className="cursor-pointer">
                          {p.is_active ? "Aktiv" : "Inaktiv"}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("de-DE")}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(p)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Briefcase className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Audit Log (Partner Lifecycle) */}
      <div className="pt-6">
        <h2 className="text-lg font-bold mb-4">Partner-Aktivitäten</h2>
        <Card>
          <CardContent className="p-0">
            <AuditLogList
              filters={{ entity_type: "partner" }}
              compact
              limit={20}
            />
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog (White Label etc) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Partner bearbeiten: {editPartner?.name}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="general" className="mt-2">
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="general">Allgemein & Abrechnung</TabsTrigger>
              <TabsTrigger value="branding">White-Label & Branding</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 pt-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Firmenname</Label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Kürzel (Slug)</Label>
                  <Input value={editSlug} onChange={(e) => setEditSlug(normalizeSlug(e.target.value))} />
                  <div className="text-[10px] mt-1">
                    {editSlugStatus.kind === "checking" && <span className="text-muted-foreground">Prüfe…</span>}
                    {editSlugStatus.kind === "available" && <span className="text-green-600">✓ verfügbar</span>}
                    {editSlugStatus.kind === "taken" && <span className="text-destructive">✗ vergeben</span>}
                    {editSlugStatus.kind === "invalid" && <span className="text-destructive">{editSlugStatus.message}</span>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Kontakt-E-Mail</Label>
                  <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="zentrale@partner.de" />
                </div>
                <div className="space-y-1.5">
                  <Label>Abrechnungsmodell</Label>
                  <Select value={editBillingMode} onValueChange={(v: any) => setEditBillingMode(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wholesale">Wiederverkauf (Wholesale)</SelectItem>
                      <SelectItem value="commission">Provisionsmodell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editBillingMode === "commission" && (
                  <div className="space-y-1.5">
                    <Label>Provisionssatz (%)</Label>
                    <Input type="number" value={editCommissionPct} onChange={(e) => setEditCommissionPct(e.target.value)} />
                  </div>
                )}
                <div className="flex items-center gap-2 pt-6">
                  <Label>Partner aktiv</Label>
                  <button onClick={() => setEditActive(!editActive)}>
                    <Badge variant={editActive ? "default" : "secondary"}>{editActive ? "Ja" : "Nein"}</Badge>
                  </button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="branding" className="space-y-4 pt-4">
              <div className="flex items-center gap-2 mb-4 p-3 bg-accent/20 rounded-lg">
                <AlertCircle className="h-4 w-4 text-primary" />
                <div className="flex-1">
                  <p className="text-xs font-bold">White-Labeling (Stage 7)</p>
                  <p className="text-[10px] text-muted-foreground">Ermöglicht eigene Subdomain, Logo und Farben im Portal.</p>
                </div>
                <button onClick={() => setEditWhiteLabel(!editWhiteLabel)}>
                  <Badge variant={editWhiteLabel ? "default" : "outline"}>{editWhiteLabel ? "Aktiviert" : "Deaktiviert"}</Badge>
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-4 opacity-100 data-[disabled=true]:opacity-50 pointer-events-auto data-[disabled=true]:pointer-events-none" data-disabled={!editWhiteLabel}>
                <div className="space-y-1.5">
                  <Label>Angezeigter Brand-Name</Label>
                  <Input value={editBrandDisplayName} onChange={(e) => setEditBrandDisplayName(e.target.value)} placeholder="Mustermann Cloud" />
                </div>
                <div className="space-y-1.5">
                  <Label>Eigene Subdomain (EMS Pro)</Label>
                  <div className="flex items-center gap-1">
                    <Input value={editSubdomain} onChange={(e) => setEditSubdomain(normalizeSlug(e.target.value))} placeholder="mustermann" />
                    <span className="text-xs text-muted-foreground">.aicono.org</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Eigene Domain (optional)</Label>
                  <Input value={editCustomDomain} onChange={(e) => setEditCustomDomain(e.target.value)} placeholder="ems.partner-firma.de" />
                </div>
                <div className="space-y-1.5">
                  <Label>Support-E-Mail (Branded)</Label>
                  <Input type="email" value={editSupportEmail} onChange={(e) => setEditSupportEmail(e.target.value)} placeholder="support@partner.de" />
                </div>

                <div className="md:col-span-2 grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Primärfarbe</Label>
                    <div className="flex gap-2">
                      <Input type="color" value={editPrimaryColor || "#0ea5e9"} onChange={(e) => setEditPrimaryColor(e.target.value)} className="w-10 p-1 h-9" />
                      <Input value={editPrimaryColor} onChange={(e) => setEditPrimaryColor(e.target.value)} placeholder="#0ea5e9" className="flex-1" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sekundärfarbe</Label>
                    <div className="flex gap-2">
                      <Input type="color" value={editSecondaryColor || "#f4f4f5"} onChange={(e) => setEditSecondaryColor(e.target.value)} className="w-10 p-1 h-9" />
                      <Input value={editSecondaryColor} onChange={(e) => setEditSecondaryColor(e.target.value)} placeholder="#f4f4f5" className="flex-1" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Akzentfarbe</Label>
                    <div className="flex gap-2">
                      <Input type="color" value={editAccentColor || "#f59e0b"} onChange={(e) => setEditAccentColor(e.target.value)} className="w-10 p-1 h-9" />
                      <Input value={editAccentColor} onChange={(e) => setEditAccentColor(e.target.value)} placeholder="#f59e0b" className="flex-1" />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <Label>Partner-Logo</Label>
                  <div className="flex items-center gap-4 border p-4 rounded-lg bg-muted/20">
                    <div className="h-16 w-32 bg-background border rounded flex items-center justify-center overflow-hidden">
                      {editLogoUrl ? <img src={editLogoUrl} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-[10px] text-muted-foreground uppercase font-bold">Kein Logo</span>}
                    </div>
                    <div className="flex-1 space-y-2">
                      <Input type="file" accept="image/*" onChange={handleLogoUpload} disabled={logoUploading} className="text-xs" />
                      <p className="text-[10px] text-muted-foreground">Empfohlen: PNG oder SVG, max. 512px Breite.</p>
                    </div>
                    {logoUploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving ? "Wird gespeichert…" : "Änderungen speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generic Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Partner-Administrator einladen</DialogTitle>
            <DialogDescription>
              Für Partner: <strong>{invitePartner?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>E-Mail-Adresse *</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="chef@partner.de"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name des Administrators</Label>
              <Input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Anna Beispiel"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSendInvite} disabled={inviteSaving || !inviteEmail}>
              {inviteSaving ? "Wird gesendet…" : "Einladung senden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </main>
    </div>
  );
}
