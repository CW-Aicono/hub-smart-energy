import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import aiconoLogo from "@/assets/aicono-logo.png";

const SetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { clearRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace("#", "?").replace(/^\\?/, ""));
    const errorCode = params.get("error_code") || params.get("error");
    const errorDesc = params.get("error_description");

    if (errorCode) {
      if (errorCode === "otp_expired" || errorCode.includes("expired") || errorCode.includes("not_found")) {
        setLinkError("Der Einladungslink ist abgelaufen oder wurde bereits verwendet. Bitte fordern Sie einen neuen Link an.");
      } else {
        setLinkError(errorDesc || "Der Link ist ungültig. Bitte fordern Sie einen neuen Einladungslink an.");
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
          setLinkError("Die Sitzung konnte nicht gestartet werden. Der Link ist möglicherweise abgelaufen. Bitte fordern Sie einen neuen Einladungslink an.");
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

    if (password.length < 8) {
      toast({ title: "Fehler", description: "Das Passwort muss mindestens 8 Zeichen lang sein.", variant: "destructive" });
      return;
    }

    if (password !== passwordConfirm) {
      toast({ title: "Fehler", description: "Die Passwörter stimmen nicht überein.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }

    // Clear recovery flag so user can navigate freely
    clearRecovery();
    setDone(true);
    setTimeout(() => navigate("/", { replace: true }), 2500);
  };

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel – matches Auth.tsx */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center p-12" style={{ backgroundColor: 'hsl(220, 60%, 20%)' }}>
        <div className="max-w-md text-center">
          <div className="flex flex-col items-center gap-6 mb-8">
            <div className="bg-white/50 backdrop-blur-sm rounded-2xl p-8">
              <img src={aiconoLogo} alt="AICONO" className="h-28 object-contain drop-shadow-lg" />
            </div>
          </div>
          <p className="text-base text-primary-foreground/70 leading-relaxed">
            Legen Sie jetzt Ihr Passwort fest, um auf Ihren Zugang zuzugreifen.
          </p>
        </div>
      </div>

      {/* Right form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8 bg-background">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center mb-2 lg:hidden">
              <img src={aiconoLogo} alt="AICONO" className="h-16 object-contain" />
            </div>
            <CardTitle className="text-2xl font-display">
              {done ? "Passwort gespeichert" : "Passwort festlegen"}
            </CardTitle>
            <CardDescription>
              {done
                ? "Ihr Passwort wurde erfolgreich gesetzt. Sie werden weitergeleitet …"
                : "Legen Sie ein sicheres Passwort für Ihren Zugang fest."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {done ? (
              <div className="flex flex-col items-center gap-4 py-6">
                <CheckCircle className="h-16 w-16 text-primary" />
                <p className="text-center text-muted-foreground">
                  Sie werden in Kürze weitergeleitet …
                </p>
              </div>
            ) : linkError ? (
              <div className="flex flex-col items-center gap-4 py-6">
                <AlertCircle className="h-16 w-16 text-destructive" />
                <p className="text-center text-muted-foreground text-sm">{linkError}</p>
                <button
                  type="button"
                  onClick={() => navigate("/auth")}
                  className="text-sm text-accent hover:underline font-medium"
                >
                  Zur Anmeldeseite
                </button>
              </div>
            ) : !sessionReady ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
                <p className="text-sm text-muted-foreground">Sitzung wird vorbereitet …</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Neues Passwort</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Mindestens 8 Zeichen"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="passwordConfirm">Passwort bestätigen</Label>
                  <Input
                    id="passwordConfirm"
                    type={showPassword ? "text" : "password"}
                    placeholder="Passwort wiederholen"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                  {passwordConfirm && password !== passwordConfirm && (
                    <p className="text-xs text-destructive">Passwörter stimmen nicht überein.</p>
                  )}
                </div>

                <Button
                  type="submit"
                  style={{ backgroundColor: 'hsl(220, 60%, 20%)' }}
                  className="w-full text-white hover:opacity-90"
                  disabled={submitting || password !== passwordConfirm || password.length < 8}
                >
                  {submitting ? "Wird gespeichert …" : "Passwort speichern & anmelden"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SetPassword;