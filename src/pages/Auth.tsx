import { useState, useEffect } from "react";
import { Navigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import aiconoLogo from "@/assets/aicono-logo.png";

type AuthView = "login" | "forgotPassword";

const Auth = () => {
  const { user, loading, signIn } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // If there's an invite token in the URL, redirect to the password-set page
  const inviteToken = searchParams.get("invite");

  useEffect(() => {
    // Invite tokens are now handled via the activate-invited-user flow
    // Users receive a direct password-reset link, so no invite token handling needed here
    if (inviteToken) {
      toast({
        title: "Hinweis",
        description: "Bitte nutzen Sie den Einladungslink aus Ihrer E-Mail, um Ihr Passwort zu setzen.",
      });
    }
  }, [inviteToken]);

  const authSchema = z.object({
    email: z.string().email(t("auth.invalidCredentials")),
    password: z.string().min(6, t("auth.password")),
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: t("common.error"), description: t("auth.emailPlaceholder"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/set-password`,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: t("common.error"), description: t("profile.passwordResetError"), variant: "destructive" });
    } else {
      toast({ title: t("profile.passwordResetSent"), description: t("profile.passwordResetSentDescription") });
      setView("login");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = authSchema.safeParse({ email, password });
    if (!result.success) {
      toast({ title: t("common.error"), description: result.error.errors[0].message, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      let message = error.message;
      if (message.includes("Invalid login")) message = t("auth.invalidCredentials");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center p-12" style={{ backgroundColor: 'hsl(220, 60%, 20%)' }}>
        <div className="max-w-md text-center">
          <div className="flex flex-col items-center gap-6 mb-8">
            <div className="bg-white/50 backdrop-blur-sm rounded-2xl p-8">
              <img src={aiconoLogo} alt="AICONO" className="h-28 object-contain drop-shadow-lg" />
            </div>
          </div>
          <p className="text-base text-primary-foreground/70 leading-relaxed">
            Ihr intelligentes B2B-Dashboard für Energiemanagement. Verbrauch analysieren, Kosten optimieren und Nachhaltigkeitsziele erreichen.
          </p>
        </div>
      </div>

      {/* Right auth form */}
      <div className="flex flex-col w-full lg:w-1/2 items-center justify-center p-8 bg-background">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center mb-2 lg:hidden">
              <img src={aiconoLogo} alt="AICONO" className="h-16 object-contain" />
            </div>
            <CardTitle className="text-2xl font-display">
              {view === "forgotPassword" ? t("auth.forgotPassword") : t("auth.welcomeBack")}
            </CardTitle>
            <CardDescription>
              {view === "forgotPassword"
                ? t("profile.passwordResetViaEmailDescription")
                : t("auth.loginSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {view === "forgotPassword" ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("auth.emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" style={{ backgroundColor: 'hsl(220, 60%, 20%)' }} className="w-full text-white hover:opacity-90" disabled={submitting}>
                  {submitting ? t("common.loading") : t("profile.passwordResetViaEmail")}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setView("login")}
                    className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    {t("auth.loginNow")}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("auth.emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">{t("auth.password")}</Label>
                    <button
                      type="button"
                      onClick={() => setView("forgotPassword")}
                      className="text-xs text-accent hover:underline font-medium"
                    >
                      {t("auth.forgotPassword")}
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" style={{ backgroundColor: 'hsl(220, 60%, 20%)' }} className="w-full text-white hover:opacity-90" disabled={submitting}>
                  {submitting ? t("common.loading") : t("auth.login")}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <Link to="/datenschutz" className="hover:underline">Datenschutz</Link>
          <span>·</span>
          <Link to="/impressum" className="hover:underline">Impressum</Link>
        </div>
      </div>
    </div>
  );
};

export default Auth;
