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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Loader2, Plus, Mail, Users, AlertCircle, CheckCircle2, Send } from "lucide-react";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";

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
      const { error } = await supabase
        .from("partners")
        .update({
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
        })
        .eq("id", editPartner.id);
      if (error) throw error;
      toast({ title: "Partner gespeichert" });
      qc.invalidateQueries({ queryKey: ["super-admin-partners"] });
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
                  {slugStatus.kind === "available" && (
                    <span className="text-primary flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Slug ist verfügbar.
                    </span>
                  )}
                  {slugStatus.kind === "taken" && (
                    <span className="text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Slug ist bereits vergeben.
                    </span>
                  )}
                  {slugStatus.kind === "invalid" && (
                    <span className="text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {slugStatus.message}
                    </span>
                  )}
                  {slugStatus.kind === "idle" && (
                    <span className="text-muted-foreground">a–z, 0–9 und Bindestriche, 2–50 Zeichen.</span>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-admin-email">E-Mail Partner-Admin (optional)</Label>
                <Input
                  id="p-admin-email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@mustermann-elektro.de"
                />
                <p className="text-xs text-muted-foreground">
                  Wenn angegeben, wird sofort eine Einladung versendet.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-admin-name">Name Partner-Admin (optional)</Label>
                <Input id="p-admin-name" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Max Mustermann" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Abbrechen</Button>
              <Button onClick={handleCreate} disabled={createDisabled}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                {adminEmail.trim() ? "Anlegen & Einladen" : "Anlegen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="border rounded-lg overflow-x-auto bg-card">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Lade Partner …
          </div>
        ) : partners.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">Noch keine Partner angelegt.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Kontakt</TableHead>
                <TableHead className="text-center"><Users className="h-4 w-4 inline" /></TableHead>
                <TableHead>Modell</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((p) => {
                const count = memberCounts[p.id] ?? 0;
                const needsInvite = count === 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <button
                        className="text-left hover:underline text-foreground hover:text-primary transition-colors"
                        onClick={() => openEditDialog(p)}
                        title="Bearbeiten"
                      >
                        {p.name}
                      </button>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.slug}</TableCell>
                    <TableCell className="text-sm">{p.contact_email ?? "–"}</TableCell>
                    <TableCell className="text-center">{count}</TableCell>
                    <TableCell className="text-xs">{p.billing_mode}</TableCell>
                    <TableCell>
                      <Badge variant={p.is_active ? "default" : "secondary"}>
                        {p.is_active ? "aktiv" : "inaktiv"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      {needsInvite ? (
                        <Button variant="outline" size="sm" onClick={() => openInviteDialog(p, "new")}>
                          <Mail className="h-3.5 w-3.5 mr-1" /> Einladen
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openInviteDialog(p, "resend")}
                          title="Einladungs-Mail erneut senden (z. B. nach Ablauf des Links)"
                        >
                          <Send className="h-3.5 w-3.5 mr-1" /> Erneut einladen
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive.mutate(p)}
                        disabled={toggleActive.isPending}
                      >
                        {p.is_active ? "Deaktivieren" : "Aktivieren"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Invite-Dialog */}
      <Dialog
        open={inviteOpen}
        onOpenChange={(o) => {
          setInviteOpen(o);
          if (!o) { setInvitePartner(null); setInviteEmail(""); setInviteName(""); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Partner-Admin einladen</DialogTitle>
            <DialogDescription>
              {invitePartner
                ? `Einladungs-Mail mit neuem Passwort-Setz-Link an den Partner-Admin von ${invitePartner.name} senden. Vorherige Links werden ungültig.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">E-Mail Partner-Admin *</Label>
              <Input
                id="inv-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="admin@firma.de"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Name (optional)</Label>
              <Input id="inv-name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Max Mustermann" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviteSaving}>Abbrechen</Button>
            <Button onClick={handleSendInvite} disabled={inviteSaving || !inviteEmail.includes("@")}>
              {inviteSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Einladung senden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit-Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setEditPartner(null); }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">

          <DialogHeader>
            <DialogTitle>Partner bearbeiten</DialogTitle>
            <DialogDescription>
              Stammdaten des Partners anpassen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="e-name">Firmenname *</Label>
              <Input id="e-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-slug">Kürzel (Slug) *</Label>
              <Input
                id="e-slug"
                value={editSlug}
                onChange={(e) => setEditSlug(normalizeSlug(e.target.value))}
                onBlur={(e) => setEditSlug(e.target.value.replace(/^-+|-+$/g, "").slice(0, 50))}
              />
              <div className="text-xs min-h-[1rem]">
                {editSlugStatus.kind === "checking" && (
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Prüfe Verfügbarkeit…
                  </span>
                )}
                {editSlugStatus.kind === "available" && (
                  <span className="text-primary flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Slug ist verfügbar.
                  </span>
                )}
                {editSlugStatus.kind === "taken" && (
                  <span className="text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Slug ist bereits vergeben.
                  </span>
                )}
                {editSlugStatus.kind === "invalid" && (
                  <span className="text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {editSlugStatus.message}
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-email">Kontakt-E-Mail</Label>
              <Input
                id="e-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="kontakt@firma.de"
              />
              <p className="text-xs text-muted-foreground">
                Wird für „Erneut einladen" als Standard-Empfänger vorgeschlagen.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-subdomain">Subdomain (optional)</Label>
              <Input
                id="e-subdomain"
                value={editSubdomain}
                onChange={(e) => setEditSubdomain(e.target.value.toLowerCase().trim())}
                placeholder="z. B. partner-name (für partner-name.aicono.org)"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                id="e-active"
                type="checkbox"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="e-active" className="cursor-pointer">Partner aktiv</Label>
            </div>

            <div className="border-t pt-3 mt-2 space-y-2">
              <Label>Abrechnungsmodell</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEditBillingMode("wholesale")}
                  className={`rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                    editBillingMode === "wholesale" ? "border-primary bg-primary/10" : "border-input"
                  }`}
                >
                  <div className="font-medium">Wiederverkauf</div>
                  <div className="text-xs text-muted-foreground">Partner kauft bei AICONO ein und verkauft mit Marge an Tenants.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setEditBillingMode("commission")}
                  className={`rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                    editBillingMode === "commission" ? "border-primary bg-primary/10" : "border-input"
                  }`}
                >
                  <div className="font-medium">Provision</div>
                  <div className="text-xs text-muted-foreground">AICONO rechnet mit den Tenants ab, Partner erhält Provision.</div>
                </button>
              </div>
              {editBillingMode === "commission" && (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="e-commission">Provisionssatz (%)</Label>
                  <Input
                    id="e-commission"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={editCommissionPct}
                    onChange={(e) => setEditCommissionPct(e.target.value)}
                    placeholder="20"
                  />
                </div>
              )}
            </div>

            {/* Stage 7: White-Label / Custom Domain */}
            <div className="border-t pt-3 mt-2 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">White-Label</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="e-wl"
                    type="checkbox"
                    checked={editWhiteLabel}
                    onChange={(e) => setEditWhiteLabel(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="e-wl" className="cursor-pointer text-sm">aktiv</Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">
                Bei Aktivierung wird das Partner-Branding (Logo + Farbe) für alle Tenants dieses Partners
                und auf der Login-Seite der eigenen Domain angezeigt.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="e-brand-name">Marken-Anzeigename (optional)</Label>
                <Input
                  id="e-brand-name"
                  value={editBrandDisplayName}
                  onChange={(e) => setEditBrandDisplayName(e.target.value)}
                  placeholder={editName || "z. B. Mustermann Energie"}
                  disabled={!editWhiteLabel}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="e-custom-domain">Custom Domain</Label>
                <Input
                  id="e-custom-domain"
                  value={editCustomDomain}
                  onChange={(e) => setEditCustomDomain(e.target.value)}
                  placeholder="energie.mustermann.de"
                  disabled={!editWhiteLabel}
                />
                <p className="text-xs text-muted-foreground">
                  DNS-CNAME auf die AICONO-Hetzner-Infrastruktur muss eingerichtet sein.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Logo</Label>
                <div className="flex items-center gap-3">
                  {editLogoUrl ? (
                    <img src={editLogoUrl} alt="Logo" className="h-12 w-12 object-contain rounded border bg-white p-1" />
                  ) : (
                    <div className="h-12 w-12 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      kein Logo
                    </div>
                  )}
                  <Input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={handleLogoUpload}
                    disabled={!editWhiteLabel || logoUploading}
                    className="text-xs"
                  />
                  {editLogoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditLogoUrl(null)}
                      disabled={!editWhiteLabel}
                    >
                      Entfernen
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">PNG/JPG/SVG/WebP, max. 2 MB.</p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="e-primary">Primärfarbe</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="e-primary"
                      type="color"
                      value={editPrimaryColor || "#1a365d"}
                      onChange={(e) => setEditPrimaryColor(e.target.value)}
                      disabled={!editWhiteLabel}
                      className="h-9 w-12 p-1"
                    />
                    <Input
                      value={editPrimaryColor}
                      onChange={(e) => setEditPrimaryColor(e.target.value)}
                      disabled={!editWhiteLabel}
                      placeholder="#1a365d"
                      className="text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-secondary">Sekundär</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="e-secondary"
                      type="color"
                      value={editSecondaryColor || "#2d8a6e"}
                      onChange={(e) => setEditSecondaryColor(e.target.value)}
                      disabled={!editWhiteLabel}
                      className="h-9 w-12 p-1"
                    />
                    <Input
                      value={editSecondaryColor}
                      onChange={(e) => setEditSecondaryColor(e.target.value)}
                      disabled={!editWhiteLabel}
                      placeholder="#2d8a6e"
                      className="text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-accent">Akzent</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="e-accent"
                      type="color"
                      value={editAccentColor || "#f59e0b"}
                      onChange={(e) => setEditAccentColor(e.target.value)}
                      disabled={!editWhiteLabel}
                      className="h-9 w-12 p-1"
                    />
                    <Input
                      value={editAccentColor}
                      onChange={(e) => setEditAccentColor(e.target.value)}
                      disabled={!editWhiteLabel}
                      placeholder="#f59e0b"
                      className="text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="e-support">Support-E-Mail (optional)</Label>
                <Input
                  id="e-support"
                  type="email"
                  value={editSupportEmail}
                  onChange={(e) => setEditSupportEmail(e.target.value)}
                  placeholder="support@mustermann.de"
                  disabled={!editWhiteLabel}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>Abbrechen</Button>
            <Button
              onClick={handleSaveEdit}
              disabled={editSaving || !editName.trim() || editSlugStatus.kind === "taken" || editSlugStatus.kind === "invalid" || editSlugStatus.kind === "checking"}
            >
              {editSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </main>
    </div>
  );
}
