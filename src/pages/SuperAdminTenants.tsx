import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useTenants } from "@/hooks/useTenants";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, ExternalLink, Building2, User, Mail, AlertCircle } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const SuperAdminTenants = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { tenants, isLoading, createTenant, deleteTenant } = useTenants();
  const { t } = useSATranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [confirmName, setConfirmName] = useState("");

  // Form state
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [creating, setCreating] = useState(false);

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">{t("common.loading")}</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const filtered = tenants.filter((tnt) =>
    tnt.name.toLowerCase().includes(search.toLowerCase()) ||
    tnt.slug.toLowerCase().includes(search.toLowerCase())
  );

  const slugify = (str: string) =>
    str.toLowerCase().replace(/[äöü]/g, c => ({ ä: "ae", ö: "oe", ü: "ue" }[c] || c))
      .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");

  const handleNameChange = (value: string) => {
    setNewName(value);
    if (!newSlug || newSlug === slugify(newName)) {
      setNewSlug(slugify(value));
    }
  };

  const handleCreate = async () => {
    if (!newName || !newSlug || !adminEmail) return;
    setCreating(true);

    try {
      // 1. Create tenant
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({ name: newName, slug: newSlug, contact_email: newEmail || adminEmail })
        .select()
        .single();

      if (tenantError) throw new Error(tenantError.message);

      // 2. Invite tenant admin via edge function
      const { data: inviteData, error: inviteError } = await supabase.functions.invoke("invite-tenant-admin", {
        body: {
          tenantId: tenant.id,
          adminEmail,
          adminName: adminName || undefined,
          redirectTo: `${window.location.origin}/profile`,
        },
      });

      // Parse error from response body if available
      let result = typeof inviteData === "string" ? JSON.parse(inviteData) : inviteData;
      if (inviteError) {
        // Try to get actual error message from response body
        const bodyText = (inviteError as { context?: { text?: string } })?.context?.text;
        if (bodyText) {
          try { result = JSON.parse(bodyText); } catch { /* ignore */ }
        }
        if (!result?.error) throw new Error(inviteError.message);
      }
      if (!result?.success) throw new Error(result?.error || "Einladung fehlgeschlagen");

      toast({
        title: "Mandant angelegt",
        description: `Eine Einladungsmail wurde an ${adminEmail} gesendet.`,
      });
      setDialogOpen(false);
      resetForm();
      // Refresh by navigating to the same page
      window.location.reload();
    } catch (err: unknown) {
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setNewName("");
    setNewSlug("");
    setNewEmail("");
    setAdminEmail("");
    setAdminName("");
  };

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("tenants.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("tenants.subtitle")}</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> {t("tenants.new")}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{t("tenants.create_title")}</DialogTitle></DialogHeader>
              <div className="space-y-5 pt-2">

                {/* Tenant section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    <Building2 className="h-4 w-4" />
                    Mandant
                  </div>
                  <div className="space-y-2">
                    <Label>{t("common.name")} *</Label>
                    <Input value={newName} onChange={(e) => handleNameChange(e.target.value)} placeholder="Firma GmbH" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("tenants.slug")} *</Label>
                    <Input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="firma-gmbh" />
                    <p className="text-xs text-muted-foreground">Eindeutiger Bezeichner (wird automatisch befüllt)</p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("tenants.contact_email")}</Label>
                    <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="info@firma.de" type="email" />
                    <p className="text-xs text-muted-foreground">Allgemeine Kontaktadresse des Mandanten (optional)</p>
                  </div>
                </div>

                <div className="border-t" />

                {/* Admin section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    <User className="h-4 w-4" />
                    Administrator-Account
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-accent/10 rounded-lg border border-accent/20">
                    <AlertCircle className="h-4 w-4 text-accent mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Nach dem Anlegen wird automatisch eine Einladungsmail an den Administrator gesendet. Der Administrator vergibt sich darüber selbst ein Passwort.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      E-Mail des Administrators *
                    </Label>
                    <Input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@firma.de" type="email" />
                  </div>
                  <div className="space-y-2">
                    <Label>Name des Administrators</Label>
                    <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Max Mustermann" />
                  </div>
                </div>

                <Button
                  onClick={handleCreate}
                  disabled={creating || !newName || !newSlug || !adminEmail}
                  className="w-full"
                >
                  {creating ? "Wird angelegt..." : "Mandant anlegen & Einladung senden"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </header>
        <div className="p-6">
          <Input placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm mb-4" />
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>{t("common.email")}</TableHead>
                    <TableHead>{t("common.created")}</TableHead>
                    <TableHead className="w-24">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t("common.loading")}</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t("tenants.not_found")}</TableCell></TableRow>
                  ) : (
                    filtered.map((tenant) => (
                      <TableRow key={tenant.id} className="cursor-pointer" onClick={() => navigate(`/super-admin/tenants/${tenant.id}`)}>
                        <TableCell className="font-medium">{tenant.name}</TableCell>
                        <TableCell className="text-muted-foreground">{tenant.slug}</TableCell>
                        <TableCell className="text-muted-foreground">{tenant.contact_email || "–"}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(tenant.created_at).toLocaleDateString("de-DE")}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); navigate(`/super-admin/tenants/${tenant.id}`); }}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: tenant.id, name: tenant.name }); setConfirmName(""); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Double-confirm delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setConfirmName(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mandant unwiderruflich löschen?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Der Mandant <strong>{deleteTarget?.name}</strong> und alle zugehörigen Daten werden dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
                <p className="text-sm">
                  Bitte geben Sie zur Bestätigung den Namen des Mandanten ein:
                </p>
                <Input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={deleteTarget?.name}
                  className="mt-1"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmName !== deleteTarget?.name}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              onClick={() => {
                if (deleteTarget) {
                  deleteTenant.mutate(deleteTarget.id);
                  setDeleteTarget(null);
                  setConfirmName("");
                }
              }}
            >
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SuperAdminTenants;
