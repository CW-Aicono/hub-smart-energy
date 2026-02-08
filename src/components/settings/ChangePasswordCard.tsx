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
      const redirectUrl = `${window.location.origin}/auth?mode=reset`;
      
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: redirectUrl,
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
        <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/30">
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
