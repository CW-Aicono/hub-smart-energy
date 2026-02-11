import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useTenantModules, ALL_MODULES } from "@/hooks/useTenantModules";
import { useTenantLicense } from "@/hooks/useTenantLicense";
import { useModulePrices } from "@/hooks/useModulePrices";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { HeadsetIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const SuperAdminTenantDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { modules, toggleModule } = useTenantModules(id ?? null);
  const { license, upsertLicense } = useTenantLicense(id ?? null);
  const { getPrice: getGlobalPrice } = useModulePrices();
  const queryClient = useQueryClient();

  const [licenseForm, setLicenseForm] = useState<Record<string, string | number>>({});

  // Tenant info
  const { data: tenant } = useQuery({
    queryKey: ["tenant-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });

  // Tenant users
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
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Laden...</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const getModuleEnabled = (code: string) => {
    const mod = modules.find((m) => m.module_code === code);
    return mod ? mod.is_enabled : false;
  };

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
      await supabase
        .from("tenant_modules")
        .update({ price_override: value })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("tenant_modules")
        .insert({ tenant_id: id, module_code: moduleCode, is_enabled: false, price_override: value });
    }
    queryClient.invalidateQueries({ queryKey: ["tenant-modules", id] });
    toast.success("Preis aktualisiert");
  };

  // Calculate total monthly cost
  const totalMonthly = ALL_MODULES
    .filter((m) => !("alwaysOn" in m) && getModuleEnabled(m.code))
    .reduce((sum, m) => sum + getEffectivePrice(m.code), 0);

  const handleSaveLicense = () => {
    upsertLicense.mutate(licenseForm);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{tenant?.name ?? "Mandant"}</h1>
            <p className="text-sm text-muted-foreground mt-1">{tenant?.slug}</p>
          </div>
          <Button
            variant={(tenant as any)?.remote_support_enabled ? "default" : "outline"}
            disabled={!(tenant as any)?.remote_support_enabled}
            onClick={() => {
              if ((tenant as any)?.remote_support_enabled) {
                toast.success("Remote-Support-Sitzung gestartet für " + tenant?.name);
              }
            }}
          >
            <HeadsetIcon className="h-4 w-4 mr-2" />
            Remote-Support
            {(tenant as any)?.remote_support_enabled && (
              <Badge variant="secondary" className="ml-2 bg-green-500/20 text-green-600">Aktiv</Badge>
            )}
          </Button>
        </header>
        <div className="p-6">
          <Tabs defaultValue="modules">
            <TabsList>
              <TabsTrigger value="modules">Module</TabsTrigger>
              <TabsTrigger value="license">Lizenz</TabsTrigger>
              <TabsTrigger value="users">Benutzer</TabsTrigger>
            </TabsList>

            <TabsContent value="modules" className="mt-6 space-y-6">
              <Card>
                <CardHeader><CardTitle>Module freischalten & Preise</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Modul</TableHead>
                        <TableHead className="w-24 text-center">Aktiv</TableHead>
                        <TableHead className="w-36 text-right">Globalpreis</TableHead>
                        <TableHead className="w-44 text-right">Individueller Preis</TableHead>
                        <TableHead className="w-32 text-right">Effektiv</TableHead>
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
                              {isAlwaysOn ? (
                                <Badge variant="secondary">Immer</Badge>
                              ) : (
                                <Switch
                                  checked={getModuleEnabled(mod.code)}
                                  onCheckedChange={(checked) => toggleModule.mutate({ moduleCode: mod.code, enabled: checked })}
                                />
                              )}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {isAlwaysOn ? "–" : `${globalPrice.toFixed(2)} €`}
                            </TableCell>
                            <TableCell className="text-right">
                              {isAlwaysOn ? "–" : (
                                <div className="flex items-center justify-end gap-1">
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    placeholder="Standard"
                                    className="w-28 text-right h-8 text-sm"
                                    defaultValue={override != null ? override : ""}
                                    onBlur={(e) => {
                                      const val = e.target.value.trim();
                                      if (val === "") {
                                        if (override != null) updatePriceOverride(mod.code, null);
                                      } else {
                                        const num = parseFloat(val);
                                        if (!isNaN(num) && num !== override) updatePriceOverride(mod.code, num);
                                      }
                                    }}
                                  />
                                  <span className="text-xs text-muted-foreground">€</span>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {isAlwaysOn ? "–" : (
                                <span className={override != null ? "text-primary" : ""}>
                                  {effective.toFixed(2)} €
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <div className="flex justify-end mt-4 pt-4 border-t">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Monatliche Gesamtkosten (aktive Module)</p>
                      <p className="text-xl font-bold">{totalMonthly.toFixed(2)} €</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="license" className="mt-6">
              <Card>
                <CardHeader><CardTitle>Lizenz & Abrechnung</CardTitle></CardHeader>
                <CardContent className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label>Plan</Label>
                    <Input
                      defaultValue={license?.plan_name ?? "basic"}
                      onChange={(e) => setLicenseForm((f) => ({ ...f, plan_name: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Preis/Monat (€)</Label>
                      <Input
                        type="number"
                        defaultValue={license?.price_monthly ?? 0}
                        onChange={(e) => setLicenseForm((f) => ({ ...f, price_monthly: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Preis/Jahr (€)</Label>
                      <Input
                        type="number"
                        defaultValue={license?.price_yearly ?? 0}
                        onChange={(e) => setLicenseForm((f) => ({ ...f, price_yearly: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Max. Benutzer</Label>
                      <Input
                        type="number"
                        defaultValue={license?.max_users ?? 5}
                        onChange={(e) => setLicenseForm((f) => ({ ...f, max_users: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max. Standorte</Label>
                      <Input
                        type="number"
                        defaultValue={license?.max_locations ?? 3}
                        onChange={(e) => setLicenseForm((f) => ({ ...f, max_locations: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Abrechnungszyklus</Label>
                    <Select
                      defaultValue={license?.billing_cycle ?? "monthly"}
                      onValueChange={(v) => setLicenseForm((f) => ({ ...f, billing_cycle: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monatlich</SelectItem>
                        <SelectItem value="yearly">Jährlich</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      defaultValue={license?.status ?? "active"}
                      onValueChange={(v) => setLicenseForm((f) => ({ ...f, status: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Aktiv</SelectItem>
                        <SelectItem value="expired">Abgelaufen</SelectItem>
                        <SelectItem value="cancelled">Gekündigt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleSaveLicense} disabled={upsertLicense.isPending}>
                    {upsertLicense.isPending ? "Speichere..." : "Lizenz speichern"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="users" className="mt-6">
              <Card>
                <CardHeader><CardTitle>Benutzer ({users.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>E-Mail</TableHead>
                        <TableHead>Kontaktperson</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Erstellt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Keine Benutzer</TableCell></TableRow>
                      ) : (
                        users.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell>{u.email ?? "–"}</TableCell>
                            <TableCell>{u.contact_person ?? "–"}</TableCell>
                            <TableCell>
                              <Badge variant={u.is_blocked ? "destructive" : "secondary"}>
                                {u.is_blocked ? "Gesperrt" : "Aktiv"}
                              </Badge>
                            </TableCell>
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
