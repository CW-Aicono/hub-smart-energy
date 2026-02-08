import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCheck, UserX, Shield, User, Mail, Clock, Send, Trash2, CalendarClock, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import EditUserDialog from "./EditUserDialog";
import DeleteUserDialog from "./DeleteUserDialog";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface UserWithRole {
  id: string;
  user_id: string;
  email: string | null;
  company_name: string | null;
  contact_person: string | null;
  is_blocked: boolean;
  role: "admin" | "user";
  created_at: string;
  status: "active" | "invited";
  expires_at?: string;
  invitation_id?: string;
}

const UserManagement = () => {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const adminCount = users.filter((u) => u.role === "admin").length;

  const fetchUsers = async () => {
    setLoading(true);
    
    // Fetch profiles with email
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

    // Fetch pending invitations
    const { data: invitations, error: invitationsError } = await supabase
      .from("user_invitations")
      .select("*")
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString());

    if (invitationsError) {
      console.error("Error fetching invitations:", invitationsError);
    }

    // Combine registered users
    const registeredUsers: UserWithRole[] = profiles.map((profile) => {
      const userRole = roles?.find((r) => r.user_id === profile.user_id);
      return {
        id: profile.id,
        user_id: profile.user_id,
        email: profile.email,
        company_name: profile.company_name,
        contact_person: profile.contact_person,
        is_blocked: profile.is_blocked,
        role: (userRole?.role as "admin" | "user") ?? "user",
        created_at: profile.created_at,
        status: "active" as const,
      };
    });

    // Add pending invitations
    const pendingInvitations: UserWithRole[] = (invitations || []).map((inv) => ({
      id: inv.id,
      user_id: inv.id, // Use invitation id as user_id placeholder
      email: inv.email,
      company_name: null,
      contact_person: null,
      is_blocked: false,
      role: inv.role as "admin" | "user",
      created_at: inv.created_at,
      status: "invited" as const,
      expires_at: inv.expires_at,
      invitation_id: inv.id,
    }));

    setUsers([...registeredUsers, ...pendingInvitations]);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const isLastAdminSelf = (userId: string, role: string) => {
    return role === "admin" && adminCount <= 1 && currentUser?.id === userId;
  };

  const toggleBlockUser = async (userId: string, currentlyBlocked: boolean) => {
    // Prevent last admin from blocking themselves
    const user = users.find(u => u.user_id === userId);
    if (user && isLastAdminSelf(userId, user.role) && !currentlyBlocked) {
      toast({
        title: t("common.error"),
        description: t("users.cannotBlockLastAdmin"),
        variant: "destructive",
      });
      return;
    }

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
    // Prevent last admin from demoting themselves
    if (newRole !== "admin" && adminCount <= 1) {
      const user = users.find(u => u.user_id === userId);
      if (user?.role === "admin") {
        toast({
          title: t("common.error"),
          description: t("users.cannotDemoteLastAdmin"),
          variant: "destructive",
        });
        return;
      }
    }

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

  const revokeInvitation = async (invitationId: string) => {
    const { error } = await supabase
      .from("user_invitations")
      .delete()
      .eq("id", invitationId);

    if (error) {
      toast({
        title: t("common.error"),
        description: t("users.invitationRevokeError"),
        variant: "destructive",
      });
    } else {
      toast({
        title: t("users.invitationRevoked"),
        description: t("users.invitationRevokedDescription"),
      });
      fetchUsers();
    }
  };

  const resendInvitation = async (invitationId: string, email: string, role: "admin" | "user") => {
    // Update expiration date
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 7);

    const { data: invitation, error: updateError } = await supabase
      .from("user_invitations")
      .update({ expires_at: newExpiresAt.toISOString() })
      .eq("id", invitationId)
      .select()
      .single();

    if (updateError || !invitation) {
      toast({
        title: t("common.error"),
        description: t("users.invitationResendError"),
        variant: "destructive",
      });
      return;
    }

    // Resend email
    try {
      const inviteLink = `${window.location.origin}/auth?token=${invitation.token}`;
      
      const { error: emailError } = await supabase.functions.invoke("send-invitation-email", {
        body: {
          email,
          inviteLink,
          invitedByEmail: currentUser?.email,
          role,
        },
      });

      if (emailError) throw emailError;

      toast({
        title: t("users.invitationResent"),
        description: t("users.invitationResentDescription"),
      });
      fetchUsers();
    } catch (error) {
      console.error("Error resending invitation email:", error);
      toast({
        title: t("common.error"),
        description: t("users.invitationResendError"),
        variant: "destructive",
      });
    }
  };

  const activateInvitedUser = async (invitation: UserWithRole) => {
    // This function creates a profile for an invited user and marks them as active
    // The user will still need to complete signup, but they're now "activated" in the system
    try {
      // First, mark the invitation as accepted
      const { error: acceptError } = await supabase
        .from("user_invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invitation.invitation_id);

      if (acceptError) throw acceptError;

      toast({
        title: t("users.userActivated"),
        description: t("users.userActivatedDescription"),
      });
      fetchUsers();
    } catch (error) {
      console.error("Error activating user:", error);
      toast({
        title: t("common.error"),
        description: t("users.activationError"),
        variant: "destructive",
      });
    }
  };

  const formatExpirationDate = (expiresAt: string) => {
    const date = new Date(expiresAt);
    const now = new Date();
    const daysLeft = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysLeft <= 0) return t("users.expired");
    if (daysLeft === 1) return t("users.expiresIn1Day");
    return t("users.expiresInDays").replace("{days}", String(daysLeft));
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
              {users.map((user) => {
                const cannotModify = isLastAdminSelf(user.user_id, user.role);
                const isInvited = user.status === "invited";
                
                return (
                  <TableRow key={user.id} className={isInvited ? "opacity-70" : ""}>
                    <TableCell>
                      {isInvited ? (
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium text-muted-foreground">
                              {t("users.pendingInvitation")}
                            </p>
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <EditUserDialog
                          user={user}
                          onSuccess={fetchUsers}
                          trigger={
                            <div className="flex items-center gap-2 hover:bg-muted/50 rounded-md p-1 -m-1 transition-colors cursor-pointer">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium hover:underline">
                                  {user.contact_person || t("users.unknown")}
                                </p>
                                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {user.email || user.user_id}
                                </p>
                              </div>
                            </div>
                          }
                        />
                      )}
                    </TableCell>
                    <TableCell>{user.company_name || "-"}</TableCell>
                    <TableCell>
                      {isInvited ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          {user.role === "admin" ? (
                            <>
                              <Shield className="h-3 w-3" />
                              {t("users.admin")}
                            </>
                          ) : (
                            <>
                              <User className="h-3 w-3" />
                              {t("users.userRole")}
                            </>
                          )}
                        </div>
                      ) : (
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
                      )}
                    </TableCell>
                    <TableCell>
                      {isInvited ? (
                        <div className="space-y-1">
                          <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                            <Clock className="h-3 w-3" />
                            {t("users.invited")}
                          </Badge>
                          {user.expires_at && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarClock className="h-3 w-3" />
                              {formatExpirationDate(user.expires_at)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Badge variant={user.is_blocked ? "destructive" : "default"}>
                          {user.is_blocked ? t("common.blocked") : t("common.active")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {isInvited ? (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => activateInvitedUser(user)}
                                  className="text-accent hover:text-accent/80 hover:bg-accent/10"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t("users.activateUser")}</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => resendInvitation(user.invitation_id!, user.email!, user.role)}
                                >
                                  <Send className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t("users.resendInvitation")}</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => revokeInvitation(user.invitation_id!)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t("users.revokeInvitation")}</p>
                              </TooltipContent>
                            </Tooltip>
                          </>
                        ) : (
                          <>
                            {cannotModify && !user.is_blocked ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button variant="ghost" size="sm" disabled>
                                      <UserX className="h-4 w-4 mr-1" />
                                      {t("users.block")}
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{t("users.cannotBlockLastAdmin")}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
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
                            )}
                            <DeleteUserDialog
                              userId={user.user_id}
                              userName={user.contact_person || t("users.unknown")}
                              isAdmin={user.role === "admin"}
                              adminCount={adminCount}
                              onSuccess={fetchUsers}
                            />
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default UserManagement;
