import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { SharingLayout } from "@/components/sharing/SharingLayout";

export default function SharingSetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Passwort festlegen — Meine Energie-Community";
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace("#", "?").replace(/^\?/, ""));
    const errorCode = params.get("error_code") || params.get("error");
    const errorDesc = params.get("error_description");

    if (errorCode) {
      if (errorCode.includes("expired") || errorCode.includes("not_found") || errorCode === "otp_expired") {
        setLinkError("Der Link ist abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen Link an.");
      } else {
        setLinkError(errorDesc || "Der Link ist ungültig. Bitte fordere einen neuen Link an.");
      }
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setSessionReady(true);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    const timeout = setTimeout(() => {
      setSessionReady((ready) => {
        if (!ready) {
          setLinkError("Die Sitzung konnte nicht gestartet werden. Der Link ist möglicherweise abgelaufen.");
        }
        return ready;
      });
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    if (password !== confirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    setDone(true);
    setTimeout(() => navigate("/mein-sharing/dashboard", { replace: true }), 1500);
  };

  return (
    <SharingLayout title="Passwort festlegen">
      <div className="rounded-lg border bg-card p-5 space-y-4">
        {done ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle className="h-12 w-12 text-primary" />
            <p className="text-sm text-muted-foreground text-center">
              Passwort gespeichert. Du wirst weitergeleitet …
            </p>
          </div>
        ) : linkError ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <p className="text-sm text-muted-foreground text-center">{linkError}</p>
            <Button variant="outline" onClick={() => navigate("/mein-sharing/login")}>
              Zur Anmeldung
            </Button>
          </div>
        ) : !sessionReady ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Sitzung wird vorbereitet …</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Lege jetzt dein Passwort fest. Danach kannst du dich jederzeit mit deiner
              E-Mail-Adresse und diesem Passwort anmelden.
            </p>
            <div className="space-y-2">
              <Label htmlFor="password">Neues Passwort</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Mindestens 8 Zeichen"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Passwort bestätigen</Label>
              <Input
                id="confirm"
                type={show ? "text" : "password"}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Passwort speichern
            </Button>
          </form>
        )}
      </div>
    </SharingLayout>
  );
}
