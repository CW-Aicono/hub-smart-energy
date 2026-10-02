import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Mail, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SharingLayout } from "@/components/sharing/SharingLayout";

type Mode = "password" | "magic" | "forgot";

export default function SharingLogin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Anmelden — Meine Energie-Community";
  }, []);

  useEffect(() => {
    if (user) navigate("/mein-sharing/dashboard", { replace: true });
  }, [user, navigate]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setSent(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const cleanEmail = email.trim().toLowerCase();

    try {
      if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) {
          setError("E-Mail oder Passwort ist falsch.");
          return;
        }
        // useEffect navigates on user change
      } else if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email: cleanEmail,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${window.location.origin}/mein-sharing/set-password`,
          },
        });
        if (error) {
          setError(error.message);
          return;
        }
        setSent(true);
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/mein-sharing/set-password`,
        });
        if (error) {
          setError(error.message);
          return;
        }
        setSent(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "password" ? "Anmelden" : mode === "magic" ? "Erstmalig anmelden" : "Passwort vergessen";

  return (
    <SharingLayout title={title}>
      <div className="rounded-lg border bg-card p-5 space-y-4">
        {sent ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-primary font-medium">
              <Mail className="h-4 w-4" /> Link versendet
            </div>
            <p className="text-muted-foreground">
              Wenn die Adresse <span className="font-medium text-foreground">{email}</span> als
              Community-Mitglied hinterlegt ist, haben wir dir einen Link geschickt. Bitte öffne
              ihn auf diesem Gerät, um dein Passwort festzulegen.
            </p>
            <Button variant="outline" className="w-full" onClick={() => switchMode("password")}>
              Zurück zur Anmeldung
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "password" && (
              <p className="text-sm text-muted-foreground">
                Melde dich mit deiner E-Mail-Adresse und deinem Passwort an.
              </p>
            )}
            {mode === "magic" && (
              <p className="text-sm text-muted-foreground">
                Du bist neu hier? Gib deine E-Mail-Adresse ein. Wir senden dir einen Link, mit
                dem du dein Passwort festlegst.
              </p>
            )}
            {mode === "forgot" && (
              <p className="text-sm text-muted-foreground">
                Gib deine E-Mail-Adresse ein. Wir senden dir einen Link, um ein neues Passwort
                zu setzen.
              </p>
            )}

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

            {mode === "password" && (
              <div className="space-y-2">
                <Label htmlFor="password">Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === "password" ? "Anmelden" : "Link per Mail senden"}
            </Button>

            <div className="flex flex-col gap-2 pt-2 border-t text-sm">
              {mode !== "password" && (
                <button
                  type="button"
                  onClick={() => switchMode("password")}
                  className="text-primary hover:underline text-left flex items-center gap-2"
                >
                  <KeyRound className="h-3.5 w-3.5" /> Mit Passwort anmelden
                </button>
              )}
              {mode !== "magic" && (
                <button
                  type="button"
                  onClick={() => switchMode("magic")}
                  className="text-primary hover:underline text-left flex items-center gap-2"
                >
                  <Mail className="h-3.5 w-3.5" /> Erstmalig anmelden / Passwort einrichten
                </button>
              )}
              {mode !== "forgot" && (
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-muted-foreground hover:underline text-left"
                >
                  Passwort vergessen?
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </SharingLayout>
  );
}
