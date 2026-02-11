import { Navigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, User, UserPlus, UserCheck, UserX, Mail, Trash2, Pencil, Settings2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SuperAdminInviteDialog from "@/components/super-admin/SuperAdminInviteDialog";
import EditSAUserDialog from "@/components/super-admin/EditSAUserDialog";
import TenantModulesDialog from "@/components/super-admin/TenantModulesDialog";

interface PlatformUser {
  id: string;
  user_id: string;
  email: string | null;
  contact_person: string | null;
  company_name: string | null;
  is_blocked: boolean;
  created_at: string;
  tenant_id: string | null;
  tenant_name: string | null;
  role: "admin" | "user" | "super_admin";
}

const SuperAdminUsers = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["super-admin-users"],
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("*, tenants(name)");
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("*");
      if (rErr) throw rErr;

      return (profiles || []).map((p: any): PlatformUser => {
        const userRole = roles?.find((r: any) => r.user_id === p.user_id);
        return {
          id: p.id,
          user_id: p.user_id,
          email: p.email,
          contact_person: p.contact_person,
          company_name: p.company_name,
          is_blocked: p.is_blocked,
          created_at: p.created_at,
          tenant_id: p.tenant_id ?? null,
          tenant_name: p.tenants?.name ?? null,
          role: (userRole?.role as PlatformUser["role"]) ?? "user",
        };
      });
    },
  });

  const toggleBlock = useMutation({
    mutationFn: async ({ userId, blocked }: { userId: string; blocked: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_blocked: !blocked })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-users"] });
      toast({ title: "Status aktualisiert" });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Status konnte nicht geändert werden.", variant: "destructive" });
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "admin" | "user" | "super_admin" }) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ role })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-users"] });
      toast({ title: "Rolle aktualisiert" });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Rolle konnte nicht geändert werden.", variant: "destructive" });
    },
  });

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Laden...</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const filtered = users.filter((u) =>
    (u.email?.toLowerCase() || "").includes(search.toLowerCase()) ||
    (u.contact_person?.toLowerCase() || "").includes(search.toLowerCase())
  );

  const roleIcon = (role: string) => {
    if (role === "super_admin") return <Shield className="h-3 w-3 text-destructive" />;
    if (role === "admin") return <Shield className="h-3 w-3" />;
    return <User className="h-3 w-3" />;
  };

  const roleLabel = (role: string) => {
    if (role === "super_admin") return "Super-Admin";
    if (role === "admin") return "Admin";
    return "Benutzer";
  };

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Benutzerverwaltung</h1>
            <p className="text-sm text-muted-foreground mt-1">Alle Plattform-Benutzer verwalten</p>
          </div>
          <SuperAdminInviteDialog />
        </header>
        <div className="p-6">
          <Input
            placeholder="Suchen nach E-Mail oder Name..."
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm mb-4"
          />
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nutzername</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Erstellt</TableHead>
                    <TableHead className="w-32">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Laden...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Keine Benutzer gefunden</TableCell></TableRow>
                  ) : (
                    filtered.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{u.contact_person || "–"}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={u.role}
                            onValueChange={(val: "admin" | "user" | "super_admin") => updateRole.mutate({ userId: u.user_id, role: val })}
                          >
                            <SelectTrigger className="w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">
                                <div className="flex items-center gap-2"><User className="h-3 w-3" /> Benutzer</div>
                              </SelectItem>
                              <SelectItem value="admin">
                                <div className="flex items-center gap-2"><Shield className="h-3 w-3" /> Admin</div>
                              </SelectItem>
                              <SelectItem value="super_admin">
                                <div className="flex items-center gap-2"><Shield className="h-3 w-3 text-destructive" /> Super-Admin</div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.is_blocked ? "destructive" : "default"}>
                            {u.is_blocked ? "Gesperrt" : "Aktiv"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString("de-DE")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <EditSAUserDialog user={u} />
                            {(() => {
                              const isLastSuperAdmin = u.role === "super_admin" && users.filter((x) => x.role === "super_admin" && !x.is_blocked).length <= 1;
                              const isSelf = u.user_id === user?.id;
                              const disabled = isLastSuperAdmin && isSelf;
                              return (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => toggleBlock.mutate({ userId: u.user_id, blocked: u.is_blocked })}
                                  title={disabled ? "Letzter Super-Admin kann nicht gesperrt werden" : u.is_blocked ? "Entsperren" : "Sperren"}
                                  disabled={disabled && !u.is_blocked}
                                >
                                  {u.is_blocked ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                                </Button>
                              );
                            })()}
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
    </div>
  );
};

export default SuperAdminUsers;
