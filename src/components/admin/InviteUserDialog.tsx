import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Shield, User, Mail, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const InviteUserDialog = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleInvite = async () => {
    if (!email || !user) return;

    setLoading(true);
    
    const { data, error } = await supabase
      .from("user_invitations")
      .insert({
        email,
        role,
        invited_by: user.id,
      })
      .select()
      .single();

    if (error) {
      toast({
        title: "Fehler",
        description: "Einladung konnte nicht erstellt werden.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const link = `${window.location.origin}/auth?invite=${data.token}`;
    setInviteLink(link);

    // Send invitation email
    try {
      const { data: inviterProfile } = await supabase
        .from("profiles")
        .select("email")
        .eq("user_id", user.id)
        .single();

      const { error: emailError } = await supabase.functions.invoke("send-invitation-email", {
        body: {
          email,
          inviteLink: link,
          invitedByEmail: inviterProfile?.email || user.email,
          role,
          tenantId: tenant?.id,
        },
      });

      if (emailError) {
        console.error("Failed to send invitation email:", emailError);
        toast({
          title: "Einladung erstellt",
          description: "Der Link wurde generiert, aber die E-Mail konnte nicht gesendet werden.",
        });
      } else {
        toast({
          title: "Einladung gesendet",
          description: `Eine Einladungsmail wurde an ${email} gesendet.`,
        });
      }
    } catch (emailErr) {
      console.error("Error sending invitation email:", emailErr);
      toast({
        title: "Einladung erstellt",
        description: "Der Link wurde generiert, aber die E-Mail konnte nicht gesendet werden.",
      });
    }

    setLoading(false);
  };

  const copyToClipboard = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetDialog = () => {
    setEmail("");
    setRole("user");
    setInviteLink(null);
    setCopied(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetDialog();
    }}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Nutzer einladen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neuen Nutzer einladen</DialogTitle>
          <DialogDescription>
            Erstellen Sie einen Einladungslink für einen neuen Benutzer.
          </DialogDescription>
        </DialogHeader>

        {!inviteLink ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail-Adresse</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="nutzer@firma.de"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Rolle</Label>
              <Select value={role} onValueChange={(v: "admin" | "user") => setRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Benutzer
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Administrator
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg">
              <Label className="text-xs text-muted-foreground mb-2 block">
                Einladungslink
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={inviteLink}
                  className="text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyToClipboard}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Dieser Link ist 7 Tage gültig.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {!inviteLink ? (
            <Button onClick={handleInvite} disabled={!email || loading}>
              {loading ? "Erstelle..." : "Einladung erstellen"}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setOpen(false)}>
              Schließen
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InviteUserDialog;
