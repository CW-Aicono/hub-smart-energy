import { useState, useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Zap } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

interface InvitationData {
  id: string;
  email: string;
  role: "admin" | "user";
}

const Auth = () => {
  const { user, loading, signIn, signUp } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loadingInvitation, setLoadingInvitation] = useState(false);

  const inviteToken = searchParams.get("token");

  // Check for invitation token
  useEffect(() => {
    const checkInvitation = async () => {
      if (!inviteToken) return;

      setLoadingInvitation(true);
      const { data, error } = await supabase
        .from("user_invitations")
        .select("id, email, role, expires_at, accepted_at")
        .eq("token", inviteToken)
        .single();

      if (error || !data) {
        toast({
          title: t("common.error"),
          description: t("auth.invalidInvitation"),
          variant: "destructive",
        });
        setLoadingInvitation(false);
        return;
      }

      if (data.accepted_at) {
        toast({
          title: t("common.error"),
          description: t("auth.invitationAlreadyUsed"),
          variant: "destructive",
        });
        setLoadingInvitation(false);
        return;
      }

      if (new Date(data.expires_at) < new Date()) {
        toast({
          title: t("common.error"),
          description: t("auth.invitationExpired"),
          variant: "destructive",
        });
        setLoadingInvitation(false);
        return;
      }

      setInvitation({ id: data.id, email: data.email, role: data.role as "admin" | "user" });
      setEmail(data.email);
      setIsLogin(false); // Switch to registration mode
      setLoadingInvitation(false);
    };

    checkInvitation();
  }, [inviteToken, t, toast]);

  const authSchema = z.object({
    email: z.string().email(t("auth.invalidCredentials")),
    password: z.string().min(6, t("auth.password")),
  });

  if (loading || loadingInvitation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = authSchema.safeParse({ email, password });
    if (!result.success) {
      toast({ title: t("common.error"), description: result.error.errors[0].message, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    
    if (isLogin) {
      const { error } = await signIn(email, password);
      setSubmitting(false);
      if (error) {
        let message = error.message;
        if (message.includes("Invalid login")) message = t("auth.invalidCredentials");
        toast({ title: t("common.error"), description: message, variant: "destructive" });
      }
    } else {
      // Registration flow
      const { error, data } = await signUp(email, password);
      
      if (error) {
        setSubmitting(false);
        let message = error.message;
        if (message.includes("already registered")) message = t("auth.emailAlreadyRegistered");
        toast({ title: t("common.error"), description: message, variant: "destructive" });
        return;
      }

      // If this is an invitation registration, mark the invitation as accepted and assign the role
      if (invitation && data?.user) {
        // Mark invitation as accepted
        await supabase
          .from("user_invitations")
          .update({ accepted_at: new Date().toISOString() })
          .eq("id", invitation.id);

        // Assign the role from the invitation
        if (invitation.role === "admin") {
          await supabase
            .from("user_roles")
            .update({ role: "admin" })
            .eq("user_id", data.user.id);
        }
      }

      setSubmitting(false);
      toast({ title: t("auth.registrationSuccess"), description: t("auth.confirmEmail") });
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12">
        <div className="max-w-md text-primary-foreground">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-12 w-12 rounded-lg bg-accent flex items-center justify-center">
              <Zap className="h-7 w-7 text-accent-foreground" />
            </div>
            <h1 className="text-3xl font-display font-bold">Smart Energy Hub</h1>
          </div>
          <p className="text-lg opacity-80 leading-relaxed">
            {t("auth.appDescription")}
          </p>
        </div>
      </div>

      {/* Right auth form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8 bg-background">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2 lg:hidden">
              <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center">
                <Zap className="h-5 w-5 text-accent-foreground" />
              </div>
              <span className="text-xl font-display font-bold">Smart Energy Hub</span>
            </div>
            <CardTitle className="text-2xl font-display">
              {invitation 
                ? t("auth.completeRegistration")
                : isLogin ? t("auth.welcomeBack") : t("auth.createAccount")}
            </CardTitle>
            <CardDescription>
              {invitation 
                ? t("auth.invitationDescription").replace("{email}", invitation.email)
                : isLogin ? t("auth.loginSubtitle") : t("auth.registerSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={!!invitation}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t("common.loading") : isLogin ? t("auth.login") : t("auth.register")}
              </Button>
            </form>
            {!invitation && (
              <div className="mt-4 text-center text-sm text-muted-foreground">
                {isLogin ? t("auth.noAccount") : t("auth.hasAccount")}{" "}
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-accent hover:underline font-medium"
                >
                  {isLogin ? t("auth.registerNow") : t("auth.loginNow")}
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
