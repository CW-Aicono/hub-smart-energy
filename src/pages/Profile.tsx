import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User } from "lucide-react";

const Profile = () => {
  const { user, loading: authLoading } = useAuth();
  const { t, language } = useTranslation();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const userInitials = user.email
    ? user.email.substring(0, 2).toUpperCase()
    : "??";

  const dateLocale = language === "de" ? "de-DE" : language === "nl" ? "nl-NL" : language === "es" ? "es-ES" : "en-US";

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <h1 className="text-2xl font-display font-bold">{t("profile.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("profile.subtitle")}
          </p>
        </header>
        <div className="p-6 space-y-6">
          {/* User Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <User className="h-5 w-5" />
                {t("profile.accountInfo")}
              </CardTitle>
              <CardDescription>
                {t("profile.accountInfoDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-lg">{user.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("profile.memberSince")} {new Date(user.created_at || "").toLocaleDateString(dateLocale)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Profile Settings */}
          <ProfileSettings />
        </div>
      </main>
    </div>
  );
};

export default Profile;
