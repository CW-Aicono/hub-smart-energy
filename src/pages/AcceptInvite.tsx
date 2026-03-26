import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowRight } from "lucide-react";
import aiconoLogo from "@/assets/aicono-logo.png";

const AcceptInvite = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const tokenId = searchParams.get("t");

  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenId) {
      setErrorMessage(t("invite.invalidLink" as any));
      setStatus("error");
    }
  }, [tokenId]);

  const handleAccept = async () => {
    if (!tokenId) return;
    setStatus("loading");
    try {
      const { data, error } = await supabase.functions.invoke("activate-invited-user", {
        body: { getInviteLink: true, tokenId },
      });
      if (error || !data?.success) {
        setErrorMessage(data?.error || t("invite.expiredLink" as any));
        setStatus("error");
        return;
      }
      // Redirect to the Supabase recovery action link.
      // The RecoveryGuard + useAuth isRecovery flag will ensure the user
      // lands on /set-password and cannot navigate away until PW is set.
      window.location.href = data.actionLink;
    } catch {
      setErrorMessage(t("invite.genericError" as any));
      setStatus("error");
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center p-12" style={{ backgroundColor: 'hsl(220, 60%, 20%)' }}>
        <div className="max-w-md text-center">
          <div className="flex flex-col items-center gap-6 mb-8">
            <div className="bg-white/50 backdrop-blur-sm rounded-2xl p-8">
              <img src={aiconoLogo} alt="AICONO" className="h-28 object-contain drop-shadow-lg" />
            </div>
          </div>
          <p className="text-base text-primary-foreground/70 leading-relaxed">{t("invite.brandingText" as any)}</p>
        </div>
      </div>
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8 bg-background">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center mb-2 lg:hidden">
              <img src={aiconoLogo} alt="AICONO" className="h-16 object-contain" />
            </div>
            <CardTitle className="text-2xl font-display">
              {status === "error" ? t("invite.linkInvalid" as any) : t("invite.acceptTitle" as any)}
            </CardTitle>
            <CardDescription>
              {status === "error" ? t("invite.linkCannotBeUsed" as any) : t("invite.instructions" as any)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status === "error" ? (
              <div className="flex flex-col items-center gap-4 py-6">
                <AlertCircle className="h-16 w-16 text-destructive" />
                <p className="text-center text-muted-foreground text-sm">{errorMessage}</p>
                <Button variant="outline" onClick={() => navigate("/auth")}>{t("invite.toLogin" as any)}</Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6 py-4">
                <p className="text-center text-muted-foreground text-sm">{t("invite.mainText" as any)}</p>
                <Button
                  className="w-full text-white hover:opacity-90"
                  style={{ backgroundColor: 'hsl(220, 60%, 20%)' }}
                  size="lg"
                  onClick={handleAccept}
                  disabled={status === "loading"}
                >
                  {status === "loading" ? (
                    <><span className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full inline-block" />{t("invite.loading" as any)}</>
                  ) : (
                    <>{t("invite.setPassword" as any)}<ArrowRight className="ml-2 h-4 w-4" /></>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AcceptInvite;