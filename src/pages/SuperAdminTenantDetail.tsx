import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useTenantModules, ALL_MODULES } from "@/hooks/useTenantModules";
import { useTenantLicense } from "@/hooks/useTenantLicense";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

const SuperAdminTenantDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { modules, toggleModule } = useTenantModules(id ?? null);
  const { license, upsertLicense } = useTenantLicense(id ?? null);

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

  const handleSaveLicense = () => {
    upsertLicense.mutate(licenseForm);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <h1 className="text-2xl font-bold">{tenant?.name ?? "Mandant"}</h1>
          <p className="text-sm text-muted-foreground mt-1">{tenant?.slug}</p>
        </header>
        <div className="p-6">
          <Tabs defaultValue="modules">
            <TabsList>
              <TabsTrigger value="modules">Module</TabsTrigger>
              <TabsTrigger value="license">Lizenz</TabsTrigger>
              <TabsTrigger value="users">Benutzer</TabsTrigger>
            </TabsList>

            <TabsContent value="modules" className="mt-6">
              <Card>
                <CardHeader><CardTitle>Module freischalten</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {ALL_MODULES.map((mod) => (
                    <div key={mod.code} className="flex items-center justify-between">
                      <Label className="text-base">{mod.label}</Label>
                      {"alwaysOn" in mod ? (
                        <Badge variant="secondary">Immer aktiv</Badge>
                      ) : (
                        <Switch
                          checked={getModuleEnabled(mod.code)}
                          onCheckedChange={(checked) => toggleModule.mutate({ moduleCode: mod.code, enabled: checked })}
                        />
                      )}
                    </div>
                  ))}
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
