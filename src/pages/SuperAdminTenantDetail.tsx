import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useTenantModules, ALL_MODULES } from "@/hooks/useTenantModules";
import { useTenantLicense } from "@/hooks/useTenantLicense";
import { useModulePrices } from "@/hooks/useModulePrices";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { HeadsetIcon, RotateCcw, UserPlus, Mail, Shield, User, Copy, Check, Building2, MapPin, UserCircle, Package, Gauge, Users, Receipt, Clock, Pencil, Save, Blocks, Plus, X } from "lucide-react";
import { useModuleBundles } from "@/hooks/useModuleBundles";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

interface InviteTenantAdminDialogProps {
  tenantId: string;
  tenantName: string;
  onSuccess: () => void;
}

const InviteTenantAdminDialog = ({ tenantId, tenantName, onSuccess }: InviteTenantAdminDialogProps) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "user">("admin");
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleInvite = async () => {
    if (!email || !user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-tenant-admin", {
        body: { adminEmail: email, role, tenantId },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error);
      toast.success(`Einladung an ${email} gesendet`);
      setInviteLink("sent"); // signal success
      onSuccess();
    } catch (err: any) {
      toast.error("Einladung fehlgeschlagen: " + (err?.message ?? "Unbekannter Fehler"));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => { setEmail(""); setRole("admin"); setInviteLink(null); setCopied(false); };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><UserPlus className="h-4 w-4 mr-2" />Admin einladen</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mandanten-Admin einladen</DialogTitle>
          <DialogDescription>Neuen Benutzer für <strong>{tenantName}</strong> einladen.</DialogDescription>
        </DialogHeader>
        {!inviteLink ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>E-Mail-Adresse</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="email" placeholder="admin@firma.de" value={email}
                  onChange={(e) => setEmail(e.target.value)} className="pl-10"
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Rolle</Label>
              <Select value={role} onValueChange={(v: any) => setRole(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin"><div className="flex items-center gap-2"><Shield className="h-4 w-4" />Administrator</div></SelectItem>
                  <SelectItem value="user"><div className="flex items-center gap-2"><User className="h-4 w-4" />Benutzer</div></SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg flex items-start gap-3">
              <Check className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Einladung erfolgreich gesendet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Eine E-Mail mit dem Passwort-Setzungs-Link wurde an <strong>{email}</strong> versandt.
                  Der Link ist 7 Tage gültig.
                </p>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          {!inviteLink ? (
            <Button onClick={handleInvite} disabled={!email || loading}>
              {loading ? "Wird eingeladen..." : "Einladung senden"}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setOpen(false)}>Schließen</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SuperAdminTenantDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { modules, toggleModule } = useTenantModules(id ?? null);
  const { license, upsertLicense } = useTenantLicense(id ?? null);
  const { getPrice: getGlobalPrice } = useModulePrices();
  const { bundles: allBundles, bundleItems: allBundleItems, getBundleModules } = useModuleBundles();
  const { t } = useSATranslation();
  const queryClient = useQueryClient();
  const [licenseForm, setLicenseForm] = useState<Record<string, string | number>>({});
  const [editingTenantInfo, setEditingTenantInfo] = useState(false);
  const [savingTenantInfo, setSavingTenantInfo] = useState(false);
  const [tenantInfoForm, setTenantInfoForm] = useState({ name: "", street: "", house_number: "", postal_code: "", city: "", contact_person: "", contact_email: "" });
  const [bundleDialogOpen, setBundleDialogOpen] = useState(false);

  const { data: tenant } = useQuery({
    queryKey: ["tenant-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["tenant-users", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("tenant_id", id!);
      if (error) throw error;
      return data;
    },
  });

  const { data: locationCount = 0 } = useQuery({
    queryKey: ["tenant-location-count", id],
    enabled: !!id,
    queryFn: async () => {
      const { count, error } = await supabase.from("locations").select("id", { count: "exact", head: true }).eq("tenant_id", id!).eq("is_archived", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: meterCount = 0 } = useQuery({
    queryKey: ["tenant-meter-count", id],
    enabled: !!id,
    queryFn: async () => {
      const { count, error } = await supabase.from("meters").select("id", { count: "exact", head: true }).eq("tenant_id", id!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: tenantBundleIds = [] } = useQuery({
    queryKey: ["tenant-bundles", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("tenant_bundles").select("bundle_id").eq("tenant_id", id!);
      if (error) throw error;
      return data.map((r: any) => r.bundle_id as string);
    },
  });

  const tenantBundles = allBundles.filter((b) => tenantBundleIds.includes(b.id));

  // Support sessions for billing
  const { data: supportSessions = [] } = useQuery({
    queryKey: ["tenant-support-sessions", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_sessions")
        .select("id, started_at, ended_at, expires_at, reason")
        .eq("tenant_id", id!)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">{t("common.loading")}</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const getModuleEnabled = (code: string) => modules.find((m) => m.module_code === code)?.is_enabled ?? false;
  const getModulePriceOverride = (code: string): number | null => {
    const mod = modules.find((m) => m.module_code === code);
    return mod?.price_override != null ? Number(mod.price_override) : null;
  };
  const getEffectivePrice = (code: string): number => {
    const override = getModulePriceOverride(code);
    return override != null ? override : getGlobalPrice(code);
  };

  const updatePriceOverride = async (moduleCode: string, value: number | null) => {
    if (!id) return;
    const existing = modules.find((m) => m.module_code === moduleCode);
    if (existing) {
      await supabase.from("tenant_modules").update({ price_override: value }).eq("id", existing.id);
    } else {
      await supabase.from("tenant_modules").insert({ tenant_id: id, module_code: moduleCode, is_enabled: false, price_override: value });
    }
    queryClient.invalidateQueries({ queryKey: ["tenant-modules", id] });
    toast.success(t("tenant_detail.price_updated"));
  };

  const totalMonthly = ALL_MODULES
    .filter((m) => !("alwaysOn" in m) && m.code !== "support_billing" && getModuleEnabled(m.code))
    .reduce((sum, m) => sum + getEffectivePrice(m.code), 0);

  const hasRemoteSupport = getModuleEnabled("remote_support");
  const supportPricePer15min = (tenant as any)?.support_price_per_15min ?? 25;

  const calcSessionDurationMin = (s: any): number => {
    const start = new Date(s.started_at).getTime();
    const end = s.ended_at ? new Date(s.ended_at).getTime() : new Date(s.expires_at).getTime();
    return Math.max(1, Math.round((end - start) / 60000));
  };

  const calcSessionCost = (s: any): number => {
    if (hasRemoteSupport) return 0;
    const min = calcSessionDurationMin(s);
    const blocks = Math.ceil(min / 15);
    return blocks * supportPricePer15min;
  };

  const updateSupportPrice = async (val: number) => {
    if (!id) return;
    await supabase.from("tenants").update({ support_price_per_15min: val } as any).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["tenant-detail", id] });
    toast.success(t("tenant_detail.support_price_saved"));
  };

  const totalSupportCost = supportSessions.reduce((sum, s) => sum + calcSessionCost(s), 0);

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{tenant?.name ?? t("billing.tenant")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{tenant?.slug}</p>
          </div>
          <Button
            variant={(tenant as any)?.remote_support_enabled ? "default" : "outline"}
            disabled={!(tenant as any)?.remote_support_enabled}
            onClick={() => { if ((tenant as any)?.remote_support_enabled) toast.success(t("tenant_detail.remote_support") + " – " + tenant?.name); }}
          >
            <HeadsetIcon className="h-4 w-4 mr-2" />
            {t("tenant_detail.remote_support")}
            {(tenant as any)?.remote_support_enabled && <Badge variant="secondary" className="ml-2 bg-green-500/20 text-green-600">{t("common.active")}</Badge>}
          </Button>
        </header>
        <div className="p-6">
          <Tabs defaultValue="info">
            <TabsList>
              <TabsTrigger value="info"><Building2 className="h-4 w-4 mr-1" />Info</TabsTrigger>
              <TabsTrigger value="modules">{t("tenant_detail.modules")}</TabsTrigger>
              <TabsTrigger value="license">{t("tenant_detail.license")}</TabsTrigger>
              <TabsTrigger value="users">{t("nav.users")}</TabsTrigger>
              <TabsTrigger value="billing"><Receipt className="h-4 w-4 mr-1" />{t("tenant_detail.billing")}</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="mt-6 space-y-6">
              {/* Stats tiles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Gebuchte Bundles tile with dialog */}
                <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setBundleDialogOpen(true)}>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-primary/10 p-2"><Package className="h-5 w-5 text-primary" /></div>
                      <div>
                        <p className="text-sm text-muted-foreground">Gebuchte Bundles</p>
                        <p className="text-2xl font-bold">{tenantBundles.length}</p>
                      </div>
                    </div>
                    {tenantBundles.length > 0 && (
                      <>
                        <div className="mt-3 flex flex-wrap gap-1">
                          {tenantBundles.map((b) => (
                            <Badge key={b.id} variant="secondary" className="text-xs">{b.name}</Badge>
                          ))}
                        </div>
                        <p className="mt-2 text-sm font-semibold text-primary">
                          {tenantBundles.reduce((s, b) => s + Number(b.price_monthly), 0).toFixed(2)} € / Monat
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Gebuchte Module tile */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-primary/10 p-2"><Blocks className="h-5 w-5 text-primary" /></div>
                      <div>
                        <p className="text-sm text-muted-foreground">Gebuchte Module</p>
                        <p className="text-2xl font-bold">{ALL_MODULES.filter((m) => !("alwaysOn" in m) && getModuleEnabled(m.code)).length}</p>
                      </div>
                    </div>
                    {totalMonthly > 0 && (
                      <p className="mt-3 text-sm font-semibold text-primary">{totalMonthly.toFixed(2)} € / Monat</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-primary/10 p-2"><MapPin className="h-5 w-5 text-primary" /></div>
                      <div>
                        <p className="text-sm text-muted-foreground">Liegenschaften</p>
                        <p className="text-2xl font-bold">{locationCount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-primary/10 p-2"><Gauge className="h-5 w-5 text-primary" /></div>
                      <div>
                        <p className="text-sm text-muted-foreground">Zähler</p>
                        <p className="text-2xl font-bold">{meterCount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-primary/10 p-2"><Users className="h-5 w-5 text-primary" /></div>
                      <div>
                        <p className="text-sm text-muted-foreground">Nutzer</p>
                        <p className="text-2xl font-bold">{users.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Bundle booking dialog */}
              <Dialog open={bundleDialogOpen} onOpenChange={setBundleDialogOpen}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Bundles verwalten – {tenant?.name}</DialogTitle>
                    <DialogDescription>Bundles für diesen Mandanten buchen oder entfernen.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 mt-2 max-h-[60vh] overflow-y-auto">
                    {allBundles.filter(b => b.is_active).map((bundle) => {
                      const isBooked = tenantBundleIds.includes(bundle.id);
                      const bundleModules = getBundleModules(bundle.id);
                      return (
                        <div key={bundle.id} className="flex items-center justify-between p-3 rounded-lg border">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">{bundle.name}</p>
                              <Badge variant="outline" className="text-xs">{Number(bundle.price_monthly).toFixed(2)} €/m</Badge>
                            </div>
                            {bundle.description && <p className="text-xs text-muted-foreground mt-0.5">{bundle.description}</p>}
                            <p className="text-xs text-muted-foreground mt-0.5">{bundleModules.length} Module</p>
                          </div>
                          {isBooked ? (
                            <Button variant="destructive" size="sm" onClick={async () => {
                              await supabase.from("tenant_bundles").delete().eq("tenant_id", id!).eq("bundle_id", bundle.id);
                              queryClient.invalidateQueries({ queryKey: ["tenant-bundles", id] });
                              toast.success(`${bundle.name} entfernt`);
                            }}>
                              <X className="h-3 w-3 mr-1" />Entfernen
                            </Button>
                          ) : (
                            <Button size="sm" onClick={async () => {
                              await supabase.from("tenant_bundles").insert({ tenant_id: id!, bundle_id: bundle.id });
                              queryClient.invalidateQueries({ queryKey: ["tenant-bundles", id] });
                              toast.success(`${bundle.name} gebucht`);
                            }}>
                              <Plus className="h-3 w-3 mr-1" />Buchen
                            </Button>
                          )}
                        </div>
                      );
                    })}
                    {allBundles.filter(b => b.is_active).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Keine aktiven Bundles vorhanden.</p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              {/* Existing tenant info card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Mandanten-Informationen</CardTitle>
                  {!editingTenantInfo ? (
                    <Button variant="ghost" size="icon" onClick={() => {
                      setTenantInfoForm({
                        name: tenant?.name ?? "",
                        street: (tenant as any)?.street ?? "",
                        house_number: (tenant as any)?.house_number ?? "",
                        postal_code: (tenant as any)?.postal_code ?? "",
                        city: (tenant as any)?.city ?? "",
                        contact_person: (tenant as any)?.contact_person ?? "",
                        contact_email: tenant?.contact_email ?? "",
                      });
                      setEditingTenantInfo(true);
                    }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditingTenantInfo(false)}>Abbrechen</Button>
                      <Button size="sm" disabled={savingTenantInfo} onClick={async () => {
                        setSavingTenantInfo(true);
                        const { error } = await supabase.from("tenants").update({
                          name: tenantInfoForm.name.trim() || tenant?.name,
                          street: tenantInfoForm.street.trim() || null,
                          house_number: tenantInfoForm.house_number.trim() || null,
                          postal_code: tenantInfoForm.postal_code.trim() || null,
                          city: tenantInfoForm.city.trim() || null,
                          contact_person: tenantInfoForm.contact_person.trim() || null,
                          contact_email: tenantInfoForm.contact_email.trim() || null,
                        }).eq("id", tenant!.id);
                        setSavingTenantInfo(false);
                        if (error) { toast.error("Fehler beim Speichern"); console.error(error); }
                        else {
                          toast.success("Gespeichert");
                          queryClient.invalidateQueries({ queryKey: ["tenant-detail", id] });
                          setEditingTenantInfo(false);
                        }
                      }}>
                        <Save className="h-4 w-4 mr-1" />
                        {savingTenantInfo ? "Speichere..." : "Speichern"}
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {editingTenantInfo ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={tenantInfoForm.name} onChange={(e) => setTenantInfoForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Anschrift</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                          <Input value={tenantInfoForm.street} onChange={(e) => setTenantInfoForm(f => ({ ...f, street: e.target.value }))} placeholder="Straße" />
                          <Input value={tenantInfoForm.house_number} onChange={(e) => setTenantInfoForm(f => ({ ...f, house_number: e.target.value }))} placeholder="Nr." className="w-full sm:w-24" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3">
                          <Input value={tenantInfoForm.postal_code} onChange={(e) => setTenantInfoForm(f => ({ ...f, postal_code: e.target.value }))} placeholder="PLZ" className="w-full sm:w-28" />
                          <Input value={tenantInfoForm.city} onChange={(e) => setTenantInfoForm(f => ({ ...f, city: e.target.value }))} placeholder="Stadt" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Hauptansprechpartner</Label>
                          <Input value={tenantInfoForm.contact_person} onChange={(e) => setTenantInfoForm(f => ({ ...f, contact_person: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>Kontakt-E-Mail</Label>
                          <Input type="email" value={tenantInfoForm.contact_email} onChange={(e) => setTenantInfoForm(f => ({ ...f, contact_email: e.target.value }))} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-start gap-2">
                          <Building2 className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Name</p>
                            <p>{tenant?.name ?? "–"}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Anschrift</p>
                            <p>
                              {(tenant as any)?.street || (tenant as any)?.house_number
                                ? `${(tenant as any)?.street ?? ""} ${(tenant as any)?.house_number ?? ""}`.trim()
                                : "–"}
                            </p>
                            <p>
                              {(tenant as any)?.postal_code || (tenant as any)?.city
                                ? `${(tenant as any)?.postal_code ?? ""} ${(tenant as any)?.city ?? ""}`.trim()
                                : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-start gap-2">
                          <UserCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Hauptansprechpartner</p>
                            <p>{(tenant as any)?.contact_person ?? "–"}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Kontakt-E-Mail</p>
                            <p>{tenant?.contact_email ?? "–"}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="modules" className="mt-6 space-y-6">
              <Card>
                <CardHeader><CardTitle>{t("tenant_detail.modules_prices")}</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("tenant_detail.modules")}</TableHead>
                        <TableHead className="w-24 text-center">{t("common.active")}</TableHead>
                        <TableHead className="w-36 text-right">{t("tenant_detail.global_price")}</TableHead>
                        <TableHead className="w-44 text-right">{t("tenant_detail.individual_price")}</TableHead>
                        <TableHead className="w-32 text-right">{t("tenant_detail.effective")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ALL_MODULES.map((mod) => {
                        const isAlwaysOn = "alwaysOn" in mod;
                        const globalPrice = getGlobalPrice(mod.code);
                        const override = getModulePriceOverride(mod.code);
                        const effective = getEffectivePrice(mod.code);
                        return (
                          <TableRow key={mod.code}>
                            <TableCell className="font-medium">{mod.label}</TableCell>
                            <TableCell className="text-center">
                              {isAlwaysOn ? <Badge variant="secondary">{t("common.always")}</Badge> : (
                                <Switch checked={getModuleEnabled(mod.code)} onCheckedChange={(checked) => toggleModule.mutate({ moduleCode: mod.code, enabled: checked })} />
                              )}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{isAlwaysOn ? "–" : `${globalPrice.toFixed(2)} €`}</TableCell>
                            <TableCell className="text-right">
                              {isAlwaysOn ? "–" : (
                                <div className="flex items-center justify-end gap-1">
                                  <Input key={`${mod.code}-${override}`} type="number" min={0} step={0.01} placeholder={t("common.standard")} className="w-28 text-right h-8 text-sm"
                                    defaultValue={override != null ? override : ""}
                                    onBlur={(e) => {
                                      const val = e.target.value.trim();
                                      if (val === "") { if (override != null) updatePriceOverride(mod.code, null); }
                                      else { const num = parseFloat(val); if (!isNaN(num) && num !== override) updatePriceOverride(mod.code, num); }
                                    }}
                                  />
                                  <span className="text-xs text-muted-foreground">€</span>
                                  {override != null && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title={t("tenant_detail.reset_price")} onClick={() => updatePriceOverride(mod.code, null)}>
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {isAlwaysOn ? "–" : <span className={override != null ? "text-primary" : ""}>{effective.toFixed(2)} €</span>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <div className="flex justify-end mt-4 pt-4 border-t">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">{t("tenant_detail.monthly_total")}</p>
                      <p className="text-xl font-bold">{totalMonthly.toFixed(2)} €</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="license" className="mt-6">
              <Card>
                <CardHeader><CardTitle>{t("tenant_detail.license_billing")}</CardTitle></CardHeader>
                <CardContent className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label>{t("billing.plan")}</Label>
                    <Input defaultValue={license?.plan_name ?? "basic"} onChange={(e) => setLicenseForm((f) => ({ ...f, plan_name: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("tenant_detail.price_monthly")}</Label>
                      <Input type="number" defaultValue={license?.price_monthly ?? 0} onChange={(e) => setLicenseForm((f) => ({ ...f, price_monthly: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("tenant_detail.price_yearly")}</Label>
                      <Input type="number" defaultValue={license?.price_yearly ?? 0} onChange={(e) => setLicenseForm((f) => ({ ...f, price_yearly: Number(e.target.value) }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("tenant_detail.max_users")}</Label>
                      <Input type="number" defaultValue={license?.max_users ?? 5} onChange={(e) => setLicenseForm((f) => ({ ...f, max_users: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("tenant_detail.max_locations")}</Label>
                      <Input type="number" defaultValue={license?.max_locations ?? 3} onChange={(e) => setLicenseForm((f) => ({ ...f, max_locations: Number(e.target.value) }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("tenant_detail.billing_cycle")}</Label>
                    <Select defaultValue={license?.billing_cycle ?? "monthly"} onValueChange={(v) => setLicenseForm((f) => ({ ...f, billing_cycle: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">{t("billing.monthly")}</SelectItem>
                        <SelectItem value="yearly">{t("billing.yearly")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("common.status")}</Label>
                    <Select defaultValue={license?.status ?? "active"} onValueChange={(v) => setLicenseForm((f) => ({ ...f, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{t("common.active")}</SelectItem>
                        <SelectItem value="expired">{t("tenant_detail.expired")}</SelectItem>
                        <SelectItem value="cancelled">{t("tenant_detail.cancelled")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => upsertLicense.mutate(licenseForm)} disabled={upsertLicense.isPending}>
                    {upsertLicense.isPending ? t("tenant_detail.saving") : t("tenant_detail.save_license")}
                  </Button>
                </CardContent>
              </Card>

              {/* Payment method & SEPA */}
              <Card className="mt-6">
                <CardHeader><CardTitle>{t("tenant_detail.payment_method")}</CardTitle></CardHeader>
                <CardContent className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label>{t("tenant_detail.payment_method")}</Label>
                    <Select
                      defaultValue={(tenant as any)?.payment_method ?? "invoice"}
                      onValueChange={async (v) => {
                        if (!id) return;
                        await supabase.from("tenants").update({ payment_method: v } as any).eq("id", id);
                        queryClient.invalidateQueries({ queryKey: ["tenant-detail", id] });
                        toast.success(t("tenant_detail.sepa_saved"));
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="invoice">{t("tenant_detail.invoice")}</SelectItem>
                        <SelectItem value="sepa">{t("tenant_detail.sepa_direct_debit")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {((tenant as any)?.payment_method === "sepa") && (
                    <>
                      <div className="space-y-2">
                        <Label>{t("tenant_detail.sepa_account_holder")}</Label>
                        <Input
                          defaultValue={(tenant as any)?.sepa_account_holder ?? ""}
                          onBlur={async (e) => {
                            if (!id) return;
                            await supabase.from("tenants").update({ sepa_account_holder: e.target.value.trim() || null } as any).eq("id", id);
                            queryClient.invalidateQueries({ queryKey: ["tenant-detail", id] });
                          }}
                          placeholder="Max Mustermann GmbH"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{t("tenant_detail.sepa_iban")}</Label>
                          <Input
                            defaultValue={(tenant as any)?.sepa_iban ?? ""}
                            onBlur={async (e) => {
                              if (!id) return;
                              await supabase.from("tenants").update({ sepa_iban: e.target.value.trim() || null } as any).eq("id", id);
                              queryClient.invalidateQueries({ queryKey: ["tenant-detail", id] });
                            }}
                            placeholder="DE89 3704 0044 0532 0130 00"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("tenant_detail.sepa_bic")}</Label>
                          <Input
                            defaultValue={(tenant as any)?.sepa_bic ?? ""}
                            onBlur={async (e) => {
                              if (!id) return;
                              await supabase.from("tenants").update({ sepa_bic: e.target.value.trim() || null } as any).eq("id", id);
                              queryClient.invalidateQueries({ queryKey: ["tenant-detail", id] });
                            }}
                            placeholder="COBADEFFXXX"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{t("tenant_detail.sepa_mandate_ref")}</Label>
                          <Input
                            defaultValue={(tenant as any)?.sepa_mandate_ref ?? ""}
                            onBlur={async (e) => {
                              if (!id) return;
                              await supabase.from("tenants").update({ sepa_mandate_ref: e.target.value.trim() || null } as any).eq("id", id);
                              queryClient.invalidateQueries({ queryKey: ["tenant-detail", id] });
                            }}
                            placeholder="MNDT-001"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("tenant_detail.sepa_mandate_date")}</Label>
                          <Input
                            type="date"
                            defaultValue={(tenant as any)?.sepa_mandate_date ?? ""}
                            onBlur={async (e) => {
                              if (!id) return;
                              await supabase.from("tenants").update({ sepa_mandate_date: e.target.value || null } as any).eq("id", id);
                              queryClient.invalidateQueries({ queryKey: ["tenant-detail", id] });
                            }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="users" className="mt-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>{t("nav.users")} ({users.length})</CardTitle>
                  {tenant && (
                    <InviteTenantAdminDialog
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      onSuccess={() => queryClient.invalidateQueries({ queryKey: ["tenant-users", id] })}
                    />
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("common.email")}</TableHead>
                        <TableHead>{t("tenant_detail.contact_person")}</TableHead>
                        <TableHead>{t("common.status")}</TableHead>
                        <TableHead>{t("common.created")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t("tenant_detail.no_users")}</TableCell></TableRow>
                      ) : (
                        users.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell>{u.email ?? "–"}</TableCell>
                            <TableCell>{u.contact_person ?? "–"}</TableCell>
                            <TableCell><Badge variant={u.is_blocked ? "destructive" : "secondary"}>{u.is_blocked ? t("common.blocked") : t("common.active")}</Badge></TableCell>
                            <TableCell className="text-muted-foreground">{new Date(u.created_at).toLocaleDateString("de-DE")}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="billing" className="mt-6 space-y-6">
              {/* Module costs */}
              <Card>
                <CardHeader><CardTitle>{t("tenant_detail.module_costs")}</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("tenant_detail.modules")}</TableHead>
                        <TableHead className="text-right">{t("billing.price_month")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ALL_MODULES.filter((m) => !("alwaysOn" in m) && m.code !== "support_billing" && getModuleEnabled(m.code)).map((mod) => (
                        <TableRow key={mod.code}>
                          <TableCell className="font-medium">{mod.label}</TableCell>
                          <TableCell className="text-right">{getEffectivePrice(mod.code).toFixed(2)} €</TableCell>
                        </TableRow>
                      ))}
                      {ALL_MODULES.filter((m) => !("alwaysOn" in m) && m.code !== "support_billing" && getModuleEnabled(m.code)).length === 0 && (
                        <TableRow><TableCell colSpan={2} className="text-center py-4 text-muted-foreground">{t("common.none")}</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                  <div className="flex justify-end p-4 border-t">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">{t("tenant_detail.monthly_total")}</p>
                      <p className="text-lg font-bold">{totalMonthly.toFixed(2)} €</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Support session costs */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{t("tenant_detail.support_sessions_billing")}</CardTitle>
                    <div className="flex items-center gap-2">
                      {hasRemoteSupport && (
                        <Badge variant="secondary" className="bg-primary/10 text-primary">{t("tenant_detail.flatrate_included")}</Badge>
                      )}
                    </div>
                  </div>
                  {!hasRemoteSupport && (
                    <div className="flex items-center gap-2 mt-2">
                      <Label className="text-sm shrink-0">{t("tenant_detail.price_per_15min")}</Label>
                      <Input
                        type="number" min={0} step={0.01}
                        defaultValue={supportPricePer15min}
                        className="w-28 text-right h-8 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val !== supportPricePer15min) updateSupportPrice(val);
                        }}
                      />
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("tenant_detail.date_time")}</TableHead>
                        <TableHead>{t("support.reason")}</TableHead>
                        <TableHead className="text-right">{t("tenant_detail.duration")}</TableHead>
                        <TableHead className="text-right">{t("tenant_detail.cost")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {supportSessions.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t("tenant_detail.no_support_sessions")}</TableCell></TableRow>
                      ) : (
                        supportSessions.map((s: any) => {
                          const durMin = calcSessionDurationMin(s);
                          const cost = calcSessionCost(s);
                          return (
                            <TableRow key={s.id}>
                              <TableCell className="text-muted-foreground">
                                <div className="flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5" />
                                  {new Date(s.started_at).toLocaleString("de-DE")}
                                </div>
                              </TableCell>
                              <TableCell>{s.reason ?? "–"}</TableCell>
                              <TableCell className="text-right">{durMin} {t("tenant_detail.minutes_short")}</TableCell>
                              <TableCell className="text-right font-medium">
                                {hasRemoteSupport ? (
                                  <span className="text-muted-foreground">0,00 €</span>
                                ) : (
                                  <span>{cost.toFixed(2)} €</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                  {supportSessions.length > 0 && (
                    <div className="flex justify-end p-4 border-t">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Gesamt Support-Kosten</p>
                        <p className="text-lg font-bold">{totalSupportCost.toFixed(2)} €</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminTenantDetail;
