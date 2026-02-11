import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Shield, Crown, Users, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import CreateSAPermissionRoleDialog from "@/components/super-admin/CreateSAPermissionRoleDialog";
import EditSARoleDialog from "@/components/super-admin/EditSARoleDialog";

const SA_CAPABILITIES = [
  { name: "Mandantenverwaltung", description: "Mandanten anlegen, bearbeiten, sperren und löschen" },
  { name: "Lizenzverwaltung", description: "Lizenzpläne zuweisen, verlängern und ändern" },
  { name: "Plattform-Statistiken", description: "Zugriff auf plattformweite Nutzungs- und Verbrauchsstatistiken" },
  { name: "Abrechnungsverwaltung", description: "Rechnungen einsehen, erstellen und verwalten" },
  { name: "Support-Zugriff", description: "Remote-Support-Sitzungen für Mandanten starten und verwalten" },
  { name: "Nutzerverwaltung", description: "Plattformweite Nutzerübersicht und Verwaltung" },
  { name: "Kartenansicht", description: "Alle Mandanten-Standorte auf der Karte einsehen" },
  { name: "Modulverwaltung", description: "Feature-Module für Mandanten aktivieren und deaktivieren" },
];

const SuperAdminRoles = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();

  // Fetch all users with super_admin role
  const { data: superAdmins = [], isLoading: adminsLoading } = useQuery({
    queryKey: ["sa-super-admins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, created_at")
        .eq("role", "super_admin");
      if (error) throw error;

      // Fetch profile info for these users
      if (!data || data.length === 0) return [];
      const userIds = data.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email, contact_person")
        .in("user_id", userIds);

      return data.map((r) => {
        const profile = profiles?.find((p) => p.user_id === r.user_id);
        return {
          user_id: r.user_id,
          email: profile?.email ?? "–",
          name: profile?.contact_person ?? "–",
          since: r.created_at,
        };
      });
    },
  });

  // Fetch custom SA roles
  const { data: customRoles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["sa-custom-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_roles")
        .select("*, custom_role_permissions(permission_id, permissions(name))")
        .eq("is_system_role", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Laden...</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Super-Admin Rollen & Rechte</h1>
            <p className="text-sm text-muted-foreground mt-1">Verwaltung der Super-Admin-Zugänge und deren Berechtigungen</p>
          </div>
          <CreateSAPermissionRoleDialog />
        </header>
        <div className="p-6 space-y-6">
          {/* Super-Admin Role Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-primary" />
                <CardTitle>Super-Admin Rolle</CardTitle>
              </div>
              <CardDescription>
                Die Super-Admin-Rolle gewährt plattformweiten Zugriff auf alle Verwaltungsfunktionen.
                Diese Rolle kann nicht eingeschränkt werden – alle Super-Admins haben identische Rechte.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Enthaltene Berechtigungen
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {SA_CAPABILITIES.map((cap) => (
                  <div key={cap.name} className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{cap.name}</p>
                      <p className="text-xs text-muted-foreground">{cap.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Super-Admin Users */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Super-Admins ({adminsLoading ? "…" : superAdmins.length})
              </CardTitle>
              <CardDescription>Alle Nutzer mit Super-Admin-Zugang auf der Plattform</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Seit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adminsLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Laden...</TableCell></TableRow>
                  ) : superAdmins.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Keine Super-Admins gefunden</TableCell></TableRow>
                  ) : (
                    superAdmins.map((sa) => (
                      <TableRow key={sa.user_id}>
                        <TableCell className="font-medium">{sa.name}</TableCell>
                        <TableCell className="text-muted-foreground">{sa.email}</TableCell>
                        <TableCell><Badge variant="destructive">Super-Admin</Badge></TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(sa.since).toLocaleDateString("de-DE")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {/* Custom SA Roles */}
          {customRoles.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Benutzerdefinierte Rollen ({customRoles.length})
                </CardTitle>
                <CardDescription>Erstellte Super-Admin-Rollen mit spezifischen Berechtigungen</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rolle</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead>Berechtigungen</TableHead>
                      <TableHead>Erstellt</TableHead>
                      <TableHead className="w-16">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customRoles.map((role: any) => (
                      <TableRow key={role.id}>
                        <TableCell className="font-medium">{role.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{role.description || "–"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {role.custom_role_permissions?.map((crp: any) => (
                              <Badge key={crp.permission_id} variant="secondary" className="text-xs">
                                {crp.permissions?.name ?? crp.permission_id}
                              </Badge>
                            ))}
                            {(!role.custom_role_permissions || role.custom_role_permissions.length === 0) && (
                              <span className="text-xs text-muted-foreground">Keine</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(role.created_at).toLocaleDateString("de-DE")}
                        </TableCell>
                        <TableCell>
                          <EditSARoleDialog role={role} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default SuperAdminRoles;
