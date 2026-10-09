import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound, Mail, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validatePassword, passwordErrorMessage } from "@/lib/passwordPolicy";

function DirectPasswordChangeForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = validatePassword(next, confirm, current);
    if (v) return setError(v);
    if (!user?.email) return;
    setBusy(true);
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
    if (authErr) {
      setBusy(false);
      return setError("Das aktuelle Passwort ist nicht korrekt.");
    }
    const { error: updErr } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (updErr) return setError(passwordErrorMessage(updErr as any));
    setCurrent(""); setNext(""); setConfirm("");
    toast({ title: "Passwort geändert", description: "Ihr neues Passwort ist ab sofort gültig." });
  };

  return (
    <form onSubmit={submit} className="space-y-3 max-w-md">
      <p className="font-medium">Passwort direkt ändern</p>
      <div className="space-y-1">
        <Label htmlFor="pw-current">Aktuelles Passwort</Label>
        <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pw-new">Neues Passwort</Label>
        <Input id="pw-new" type="password" autoComplete="new-password" placeholder="Mind. 8 Zeichen, Buchstabe und Ziffer" value={next} onChange={(e) => setNext(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pw-confirm">Neues Passwort bestätigen</Label>
        <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Passwort ändern
      </Button>
    </form>
  );
}

export function ChangePasswordCard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleRequestPasswordReset = async () => {
    if (!user?.email) return;

    setIsLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/set-password`;

      const { error } = await supabase.functions.invoke("send-auth-email", {
        body: {
          type: "password_reset",
          email: user.email,
          redirectTo: redirectUrl,
          locale: "de",
        },
      });

      if (error) {
        throw error;
      }

      toast({
        title: t("profile.passwordResetSent"),
        description: t("profile.passwordResetSentDescription"),
      });
      setDialogOpen(false);
    } catch (error) {
      console.error("Password reset error:", error);
      toast({
        title: t("common.error"),
        description: t("profile.passwordResetError"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="h-5 w-5" />
          {t("profile.changePassword")}
        </CardTitle>
        <CardDescription>
          {t("profile.changePasswordDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DirectPasswordChangeForm />
        <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/30 mt-6">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium">{t("profile.passwordResetViaEmail")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("profile.passwordResetViaEmailDescription")}
            </p>
          </div>
        </div>

        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button className="mt-4" variant="outline">
              <KeyRound className="h-4 w-4 mr-2" />
              {t("profile.requestPasswordChange")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("profile.confirmPasswordReset")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("profile.confirmPasswordResetDescription").replace("{email}", user?.email || "")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRequestPasswordReset}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t("common.loading")}
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    {t("profile.sendResetEmail")}
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
