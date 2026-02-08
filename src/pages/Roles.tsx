import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Users, Eye, Edit, Trash2 } from "lucide-react";

const ROLE_PERMISSIONS = {
  admin: {
    label: "Administrator",
    description: "Vollzugriff auf alle Funktionen",
    color: "bg-destructive/10 text-destructive border-destructive/20",
    permissions: [
      { name: "Dashboard anzeigen", icon: Eye },
      { name: "Standorte verwalten", icon: Edit },
      { name: "Benutzer einladen", icon: Users },
      { name: "Rollen zuweisen", icon: Shield },
      { name: "Branding anpassen", icon: Edit },
      { name: "Berichte erstellen", icon: Eye },
      { name: "Daten löschen", icon: Trash2 },
    ],
  },
  user: {
    label: "Benutzer",
    description: "Lesezugriff auf zugewiesene Bereiche",
    color: "bg-primary/10 text-primary border-primary/20",
    permissions: [
      { name: "Dashboard anzeigen", icon: Eye },
      { name: "Standorte anzeigen", icon: Eye },
      { name: "Berichte anzeigen", icon: Eye },
    ],
  },
};

const Roles = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Laden...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <h1 className="text-2xl font-display font-bold">Rollen & Rechte</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Übersicht der verfügbaren Rollen und deren Berechtigungen
          </p>
        </header>
        <div className="p-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {Object.entries(ROLE_PERMISSIONS).map(([key, role]) => (
              <Card key={key}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      {role.label}
                    </CardTitle>
                    <Badge variant="outline" className={role.color}>
                      {key}
                    </Badge>
                  </div>
                  <CardDescription>{role.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground mb-3">
                      Berechtigungen:
                    </p>
                    <ul className="space-y-2">
                      {role.permissions.map((permission, idx) => (
                        <li
                          key={idx}
                          className="flex items-center gap-2 text-sm text-foreground/80"
                        >
                          <permission.icon className="h-4 w-4 text-muted-foreground" />
                          {permission.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Hinweis zur Rollenverwaltung</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                Rollen werden Benutzern beim Einladen zugewiesen. Bestehende Benutzerrollen
                können im <strong>Admin-Bereich</strong> unter "Benutzer verwalten" geändert werden.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Roles;
