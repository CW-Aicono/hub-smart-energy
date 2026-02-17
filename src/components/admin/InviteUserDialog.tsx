import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
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
      // Create auth user directly and send password-set email via edge function
      const { data, error } = await supabase.functions.invoke("activate-invited-user", {
        body: {
          // We reuse activate-invited-user but pass email directly for new invites
          directInvite: true,
          email,
          name: name || undefined,
          role,
          tenantId: tenant?.id,
          redirectTo: `https://ems-pro.aicono.org/set-password`,
        },
      });

      if (error) throw error;
      const result = typeof data === "string" ? JSON.parse(data) : data;
      if (!result?.success) throw new Error(result?.error || "Einladung fehlgeschlagen");

      setDone(true);
      toast({
        title: "Einladung gesendet",
        description: `Eine Einladungsmail mit Passwort-Link wurde an ${email} gesendet.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : "Einladung konnte nicht erstellt werden.",
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
          Nutzer einladen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neuen Nutzer einladen</DialogTitle>
          <DialogDescription>
            Der eingeladene Nutzer erhält eine E-Mail und vergibt sich selbst ein Passwort.
          </DialogDescription>
        </DialogHeader>

        {!done ? (
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-2 p-3 bg-accent/10 rounded-lg border border-accent/20">
              <AlertCircle className="h-4 w-4 text-accent mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Nach dem Senden erhält der Nutzer eine E-Mail mit einem Link zum Passwort setzen. Der Link ist 7 Tage gültig.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail-Adresse *</Label>
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
              <Label htmlFor="name">Name (optional)</Label>
              <Input
                id="name"
                placeholder="Max Mustermann"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
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
          <div className="py-6 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
              <Mail className="h-6 w-6 text-accent" />
            </div>
            <p className="font-medium">Einladung gesendet!</p>
            <p className="text-sm text-muted-foreground">
              Eine E-Mail mit dem Link zum Passwort setzen wurde an <strong>{email}</strong> versendet.
            </p>
          </div>
        )}

        <DialogFooter>
          {!done ? (
            <Button onClick={handleInvite} disabled={!email || loading}>
              {loading ? "Wird gesendet..." : "Einladung senden"}
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
