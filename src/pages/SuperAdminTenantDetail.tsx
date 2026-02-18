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
import { HeadsetIcon, RotateCcw, UserPlus, Mail, Shield, User, Copy, Check } from "lucide-react";
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
  const { t } = useSATranslation();
  const queryClient = useQueryClient();
  const [licenseForm, setLicenseForm] = useState<Record<string, string | number>>({});

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
    .filter((m) => !("alwaysOn" in m) && getModuleEnabled(m.code))
    .reduce((sum, m) => sum + getEffectivePrice(m.code), 0);

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
          <Tabs defaultValue="modules">
            <TabsList>
              <TabsTrigger value="modules">{t("tenant_detail.modules")}</TabsTrigger>
              <TabsTrigger value="license">{t("tenant_detail.license")}</TabsTrigger>
              <TabsTrigger value="users">{t("nav.users")}</TabsTrigger>
            </TabsList>

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
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminTenantDetail;
