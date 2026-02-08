import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCheck, UserX, Shield, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import EditUserDialog from "./EditUserDialog";
import DeleteUserDialog from "./DeleteUserDialog";

interface UserWithRole {
  id: string;
  user_id: string;
  email: string;
  company_name: string | null;
  contact_person: string | null;
  is_blocked: boolean;
  role: "admin" | "user";
  created_at: string;
}

const UserManagement = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const adminCount = users.filter((u) => u.role === "admin").length;

  const fetchUsers = async () => {
    setLoading(true);
    
    // Fetch profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*");

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      setLoading(false);
      return;
    }

    // Fetch roles
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("*");

    if (rolesError) {
      console.error("Error fetching roles:", rolesError);
    }

    // Combine data
    const combinedUsers: UserWithRole[] = profiles.map((profile) => {
      const userRole = roles?.find((r) => r.user_id === profile.user_id);
      return {
        id: profile.id,
        user_id: profile.user_id,
        email: profile.user_id,
        company_name: profile.company_name,
        contact_person: profile.contact_person,
        is_blocked: profile.is_blocked,
        role: (userRole?.role as "admin" | "user") ?? "user",
        created_at: profile.created_at,
      };
    });

    setUsers(combinedUsers);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleBlockUser = async (userId: string, currentlyBlocked: boolean) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_blocked: !currentlyBlocked })
      .eq("user_id", userId);

    if (error) {
      toast({
        title: t("common.error"),
        description: t("users.userUpdateError"),
        variant: "destructive",
      });
    } else {
      toast({
        title: currentlyBlocked ? t("users.userUnblocked") : t("users.userBlocked"),
        description: currentlyBlocked ? t("users.userUnblocked") : t("users.userBlocked"),
      });
      fetchUsers();
    }
  };

  const updateUserRole = async (userId: string, newRole: "admin" | "user") => {
    const { error } = await supabase
      .from("user_roles")
      .update({ role: newRole })
      .eq("user_id", userId);

    if (error) {
      toast({
        title: t("common.error"),
        description: t("users.roleUpdateError"),
        variant: "destructive",
      });
    } else {
      toast({
        title: t("users.roleUpdated"),
        description: t("users.roleUpdated"),
      });
      fetchUsers();
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          {t("users.management")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            {t("users.noUsers")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("users.user")}</TableHead>
                <TableHead>{t("users.company")}</TableHead>
                <TableHead>{t("users.role")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{user.contact_person || t("users.unknown")}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {user.user_id}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{user.company_name || "-"}</TableCell>
                  <TableCell>
                    <Select
                      value={user.role}
                      onValueChange={(value: "admin" | "user") =>
                        updateUserRole(user.user_id, value)
                      }
                    >
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">
                          <div className="flex items-center gap-2">
                            <Shield className="h-3 w-3" />
                            {t("users.admin")}
                          </div>
                        </SelectItem>
                        <SelectItem value="user">
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3" />
                            {t("users.userRole")}
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.is_blocked ? "destructive" : "default"}>
                      {user.is_blocked ? t("common.blocked") : t("common.active")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <EditUserDialog user={user} onSuccess={fetchUsers} />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleBlockUser(user.user_id, user.is_blocked)}
                      >
                        {user.is_blocked ? (
                          <>
                            <UserCheck className="h-4 w-4 mr-1" />
                            {t("users.unblock")}
                          </>
                        ) : (
                          <>
                            <UserX className="h-4 w-4 mr-1" />
                            {t("users.block")}
                          </>
                        )}
                      </Button>
                      <DeleteUserDialog
                        userId={user.user_id}
                        userName={user.contact_person || t("users.unknown")}
                        isAdmin={user.role === "admin"}
                        adminCount={adminCount}
                        onSuccess={fetchUsers}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default UserManagement;
