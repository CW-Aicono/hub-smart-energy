import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SharingLayout } from "@/components/sharing/SharingLayout";

export default function SharingLogin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Anmelden — Meine Energie-Community";
  }, []);

  useEffect(() => {
    if (user) navigate("/mein-sharing/dashboard", { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/mein-sharing/dashboard` },
    });
    setSending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <SharingLayout title="Anmelden">
      <div className="rounded-lg border bg-card p-5 space-y-4">
        {sent ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-primary font-medium">
              <Mail className="h-4 w-4" /> Link versendet
            </div>
            <p className="text-muted-foreground">
              Wir haben dir einen Anmelde-Link an{" "}
              <span className="font-medium text-foreground">{email}</span> geschickt. Bitte öffne
              ihn auf diesem Gerät.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Gib die E-Mail-Adresse ein, mit der du der Energy-Community beigetreten bist. Du
              erhältst einen einmaligen Anmelde-Link per Mail.
            </p>
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="du@beispiel.de"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={sending}>
              {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Anmelde-Link senden
            </Button>
          </form>
        )}
      </div>
    </SharingLayout>
  );
}
