import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Shield, User, Mail, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const InviteUserDialog = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleInvite = async () => {
    if (!email || !user) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("activate-invited-user", {
        body: {
          directInvite: true,
          email,
          name: name || undefined,
          role,
          tenantId: tenant?.id,
          redirectTo: `${window.location.origin}/set-password`,
        },
      });

      if (error) throw error;
      const result = typeof data === "string" ? JSON.parse(data) : data;
      if (!result?.success) throw new Error(result?.error || T("invite.error"));

      setDone(true);
      toast({
        title: T("invite.sent"),
        description: T("invite.sentDesc").replace("{email}", email),
      });
    } catch (err: unknown) {
      toast({
        title: T("common.error"),
        description: err instanceof Error ? err.message : T("invite.error"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetDialog = () => {
    setEmail("");
    setName("");
    setRole("user");
    setDone(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetDialog();
    }}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          {T("invite.button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{T("invite.title")}</DialogTitle>
          <DialogDescription>{T("invite.description")}</DialogDescription>
        </DialogHeader>

        {!done ? (
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-2 p-3 bg-accent/10 rounded-lg border border-accent/20">
              <AlertCircle className="h-4 w-4 text-accent mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">{T("invite.info")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{T("invite.emailLabel")}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder={T("invite.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">{T("invite.nameLabel")}</Label>
              <Input
                id="name"
                placeholder={T("invite.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{T("invite.roleLabel")}</Label>
              <Select value={role} onValueChange={(v: "admin" | "user") => setRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {T("invite.roleUser")}
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      {T("invite.roleAdmin")}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
              <Mail className="h-6 w-6 text-accent" />
            </div>
            <p className="font-medium">{T("invite.sentTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {T("invite.sentConfirm")} <strong>{email}</strong>.
            </p>
          </div>
        )}

        <DialogFooter>
          {!done ? (
            <Button onClick={handleInvite} disabled={!email || loading}>
              {loading ? T("invite.sending") : T("invite.sendButton")}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setOpen(false)}>
              {T("invite.close")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InviteUserDialog;
