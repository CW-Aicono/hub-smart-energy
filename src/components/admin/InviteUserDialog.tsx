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
import { UserPlus, Shield, User, Mail, AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CheckStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; message: string }
  | { kind: "exists_same_tenant"; message: string; currentRole?: string }
  | { kind: "blocked"; message: string };

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
  const [check, setCheck] = useState<CheckStatus>({ kind: "idle" });

  const runEmailCheck = async (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setCheck({ kind: "idle" });
      return;
    }
    setCheck({ kind: "checking" });
    try {
      const { data, error } = await supabase.functions.invoke("check-email-availability", {
        body: { email: trimmed, intent: "tenant_invite", tenantId: tenant?.id },
      });
      if (error) throw error;
      const result = typeof data === "string" ? JSON.parse(data) : data;
      const status = result?.status;
      if (status === "available") {
        setCheck({ kind: "available", message: result.message ?? "E-Mail-Adresse ist verfügbar." });
      } else if (status === "exists_same_tenant") {
        setCheck({ kind: "exists_same_tenant", message: result.message, currentRole: result.currentRole });
      } else if (status === "blocked_other_tenant" || status === "blocked_super_admin" || status === "blocked_tenant_user") {
        setCheck({ kind: "blocked", message: result.message });
      } else {
        setCheck({ kind: "idle" });
      }
    } catch (err) {
      // Don't block submit on check failure – server-side guard will catch it.
      setCheck({ kind: "idle" });
      console.warn("[InviteUserDialog] availability check failed", err);
    }
  };

  const handleInvite = async () => {
    if (!email || !user) return;
    if (check.kind === "blocked") return;
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
    setCheck({ kind: "idle" });
  };

  const submitDisabled = !email || loading || check.kind === "checking" || check.kind === "blocked";

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
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (check.kind !== "idle") setCheck({ kind: "idle" });
                  }}
                  onBlur={(e) => runEmailCheck(e.target.value)}
                  className="pl-10"
                />
              </div>
              {check.kind === "checking" && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Prüfe Verfügbarkeit…
                </p>
              )}
              {check.kind === "available" && (
                <p className="text-xs text-primary flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {check.message}
                </p>
              )}
              {check.kind === "exists_same_tenant" && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {check.message}
                </p>
              )}
              {check.kind === "blocked" && (
                <p className="text-xs text-destructive flex items-start gap-1">
                  <XCircle className="h-3 w-3 mt-0.5 shrink-0" /> {check.message}
                </p>
              )}
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
            <Button onClick={handleInvite} disabled={submitDisabled}>
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
