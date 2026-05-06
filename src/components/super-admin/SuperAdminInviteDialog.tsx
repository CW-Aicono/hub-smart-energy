import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Shield, User, Mail, Copy, Check, AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type CheckStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; message: string }
  | { kind: "exists_same_tenant"; message: string; currentRole?: string }
  | { kind: "warn_other_tenant"; message: string }    // super-admin can override with force
  | { kind: "blocked"; message: string };

const SuperAdminInviteDialog = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "user" | "super_admin">("user");
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [check, setCheck] = useState<CheckStatus>({ kind: "idle" });
  const [force, setForce] = useState(false);

  const intentForRole = (r: typeof role): "tenant_invite" | "super_admin_invite" =>
    r === "super_admin" ? "super_admin_invite" : "tenant_invite";

  const runEmailCheck = async (value: string, currentRole: typeof role) => {
    const trimmed = value.trim().toLowerCase();
    setForce(false);
    if (!trimmed || !trimmed.includes("@")) {
      setCheck({ kind: "idle" });
      return;
    }
    setCheck({ kind: "checking" });
    try {
      const { data, error } = await supabase.functions.invoke("check-email-availability", {
        body: { email: trimmed, intent: intentForRole(currentRole) },
      });
      if (error) throw error;
      const result = typeof data === "string" ? JSON.parse(data) : data;
      const status = result?.status;
      if (status === "available") {
        setCheck({ kind: "available", message: result.message ?? "E-Mail-Adresse ist verfügbar." });
      } else if (status === "exists_same_tenant") {
        setCheck({ kind: "exists_same_tenant", message: result.message, currentRole: result.currentRole });
      } else if (status === "blocked_other_tenant") {
        // Super-admin can override → soft warning with force option
        setCheck({ kind: "warn_other_tenant", message: result.message });
      } else if (status === "blocked_super_admin" || status === "blocked_tenant_user") {
        setCheck({ kind: "blocked", message: result.message });
      } else {
        setCheck({ kind: "idle" });
      }
    } catch (err) {
      setCheck({ kind: "idle" });
      console.warn("[SuperAdminInviteDialog] availability check failed", err);
    }
  };

  const handleInvite = async () => {
    if (!email || !user) return;
    if (check.kind === "blocked") return;
    if (check.kind === "warn_other_tenant" && !force) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("activate-invited-user", {
        body: {
          directInvite: true,
          email,
          role,
          force: check.kind === "warn_other_tenant" ? force : undefined,
          redirectTo: `${window.location.origin}/set-password`,
        },
      });

      if (error) throw error;
      const result = typeof data === "string" ? JSON.parse(data) : data;
      if (!result?.success) throw new Error(result?.error || "Einladung konnte nicht erstellt werden.");

      setInviteLink(result.inviteUrl ?? null);
      toast({
        title: result.emailSent ? "Einladung gesendet" : "Einladung erstellt",
        description: result.emailSent
          ? `E-Mail an ${email} versendet.`
          : "Link generiert, aber E-Mail konnte nicht gesendet werden.",
      });
      queryClient.invalidateQueries({ queryKey: ["super-admin-users"] });
    } catch (err) {
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : "Einladung konnte nicht erstellt werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setEmail(""); setRole("user"); setInviteLink(null); setCopied(false);
    setCheck({ kind: "idle" }); setForce(false);
  };

  const submitDisabled =
    !email ||
    loading ||
    check.kind === "checking" ||
    check.kind === "blocked" ||
    (check.kind === "warn_other_tenant" && !force);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button><UserPlus className="h-4 w-4 mr-2" /> Nutzer einladen</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Plattform-Nutzer einladen</DialogTitle>
          <DialogDescription>Erstellen Sie einen Einladungslink für einen neuen Benutzer.</DialogDescription>
        </DialogHeader>

        {!inviteLink ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>E-Mail-Adresse</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="nutzer@firma.de"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (check.kind !== "idle") setCheck({ kind: "idle" });
                    setForce(false);
                  }}
                  onBlur={(e) => runEmailCheck(e.target.value, role)}
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
              {check.kind === "warn_other_tenant" && (
                <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
                  <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1">
                    <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {check.message}
                  </p>
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={force}
                      onChange={(e) => setForce(e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    Trotzdem übernehmen (Tenant-Zuordnung wird überschrieben)
                  </label>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Rolle</Label>
              <Select
                value={role}
                onValueChange={(v: "admin" | "user" | "super_admin") => {
                  setRole(v);
                  // Re-check because intent depends on role
                  if (email) runEmailCheck(email, v);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user"><div className="flex items-center gap-2"><User className="h-4 w-4" /> Benutzer</div></SelectItem>
                  <SelectItem value="admin"><div className="flex items-center gap-2"><Shield className="h-4 w-4" /> Administrator</div></SelectItem>
                  <SelectItem value="super_admin"><div className="flex items-center gap-2"><Shield className="h-4 w-4 text-destructive" /> Super-Admin</div></SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg">
              <Label className="text-xs text-muted-foreground mb-2 block">Einladungslink</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={inviteLink} className="text-sm" />
                <Button variant="outline" size="icon" onClick={copyToClipboard}>
                  {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Dieser Link ist 7 Tage gültig.</p>
            </div>
          </div>
        )}

        <DialogFooter>
          {!inviteLink ? (
            <Button onClick={handleInvite} disabled={submitDisabled}>
              {loading ? "Erstelle..." : "Einladung erstellen"}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setOpen(false)}>Schließen</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SuperAdminInviteDialog;
