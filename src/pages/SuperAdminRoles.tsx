import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, User, Crown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SYSTEM_ROLES = [
  {
    name: "Super-Admin",
    description: "Plattform-weiter Zugriff: Mandanten, Abrechnung, Support, Statistiken. Kann alle Daten einsehen und verwalten.",
    icon: Crown,
    color: "destructive" as const,
  },
  {
    name: "Administrator",
    description: "Voller Zugriff innerhalb eines Mandanten: Standorte, Nutzer, Integrationen, Rollen und Einstellungen.",
    icon: Shield,
    color: "default" as const,
  },
  {
    name: "Benutzer",
    description: "Eingeschränkter Zugriff basierend auf zugewiesenen Berechtigungen. Standard-Rolle für neue Nutzer.",
    icon: User,
    color: "secondary" as const,
  },
];

const SuperAdminRoles = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();

  const { data: permissions = [] } = useQuery({
    queryKey: ["sa-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("permissions").select("*").order("category");
      if (error) throw error;
      return data;
    },
  });

  const { data: rolePermissions = [] } = useQuery({
    queryKey: ["sa-role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("role_permissions").select("*, permissions(name, code, category)");
      if (error) throw error;
      return data;
    },
  });

  const { data: customRoles = [] } = useQuery({
    queryKey: ["sa-custom-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("custom_roles").select("*, tenants(name)");
      if (error) throw error;
      return data;
    },
  });

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Laden...</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  // Group permissions by category
  const permissionsByCategory = permissions.reduce<Record<string, typeof permissions>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  // Group role_permissions by role
  const adminPerms = rolePermissions.filter((rp: any) => rp.role === "admin");
  const userPerms = rolePermissions.filter((rp: any) => rp.role === "user");

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <h1 className="text-2xl font-bold">Rollen & Rechte</h1>
          <p className="text-sm text-muted-foreground mt-1">Plattform-weite Rollen und Berechtigungsübersicht</p>
        </header>
        <div className="p-6 space-y-6">
          {/* System Roles */}
          <div className="grid gap-4 md:grid-cols-3">
            {SYSTEM_ROLES.map((role) => (
              <Card key={role.name}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <role.icon className="h-5 w-5" />
                    <CardTitle className="text-base">{role.name}</CardTitle>
                  </div>
                  <Badge variant={role.color} className="w-fit">System-Rolle</Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{role.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Permissions Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Berechtigungen ({permissions.length})
              </CardTitle>
              <CardDescription>Alle verfügbaren Berechtigungen gruppiert nach Kategorie</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.entries(permissionsByCategory).map(([category, perms]) => (
                <div key={category} className="mb-6 last:mb-0">
                  <h3 className="text-sm font-semibold mb-2 capitalize">{category}</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Berechtigung</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead className="text-center">Admin</TableHead>
                        <TableHead className="text-center">Benutzer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {perms.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">{p.code}</TableCell>
                          <TableCell className="text-center">
                            {adminPerms.some((rp: any) => rp.permission_id === p.id) ? "✓" : "–"}
                          </TableCell>
                          <TableCell className="text-center">
                            {userPerms.some((rp: any) => rp.permission_id === p.id) ? "✓" : "–"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Custom Roles across tenants */}
          <Card>
            <CardHeader>
              <CardTitle>Benutzerdefinierte Rollen ({customRoles.length})</CardTitle>
              <CardDescription>Mandantenspezifische Rollen über die gesamte Plattform</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Mandant</TableHead>
                    <TableHead>Beschreibung</TableHead>
                    <TableHead>Typ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customRoles.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Keine benutzerdefinierten Rollen</TableCell></TableRow>
                  ) : (
                    customRoles.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-muted-foreground">{r.tenants?.name ?? "–"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{r.description || "–"}</TableCell>
                        <TableCell>
                          <Badge variant={r.is_system_role ? "secondary" : "outline"}>
                            {r.is_system_role ? "System" : "Benutzerdefiniert"}
                          </Badge>
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
    </div>
  );
};

export default SuperAdminRoles;
