import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import UserManualContent from "@/components/help/UserManualContent";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, HelpCircle, Mail, Phone, History, ExternalLink, Gauge, Smartphone, ShieldCheck, RefreshCw, Download, Rocket, Cpu, Zap, TrendingUp } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTenant } from "@/hooks/useTenant";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const APP_VERSION = "1.0.8";

type ManualChapter = "gettingStarted" | "locationManagement" | "floorManagement" | "energyAnalysis" | "meterManagement" | "mobileApp" | "automation" | "evCharging" | "integrations" | "arbitrageTrading";

const Help = () => {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const { tenant, refetch: refetchTenant } = useTenant();
  const { updateAvailable, checking, checkForUpdate, applyUpdate } = useUpdateCheck();
  const navigate = useNavigate();
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<ManualChapter>("gettingStarted");
  const [remoteSupportEnabled, setRemoteSupportEnabled] = useState(false);
  const [remoteSupportLoading, setRemoteSupportLoading] = useState(false);

  // Sync local state with tenant data
  useState(() => {
    if (tenant && 'remote_support_enabled' in (tenant as any)) {
      setRemoteSupportEnabled((tenant as any).remote_support_enabled ?? false);
    }
  });

  const handleToggleRemoteSupport = async (enabled: boolean) => {
    if (!tenant) return;
    setRemoteSupportLoading(true);
    const { error } = await supabase
      .from("tenants")
      .update({
        remote_support_enabled: enabled,
        remote_support_enabled_at: enabled ? new Date().toISOString() : null,
      } as any)
      .eq("id", tenant.id);
    setRemoteSupportLoading(false);
    if (error) {
      toast.error("Fehler beim Ändern des Remote-Zugriffs");
    } else {
      setRemoteSupportEnabled(enabled);
      refetchTenant();
      toast.success(enabled ? "Remote-Zugriff aktiviert" : "Remote-Zugriff deaktiviert");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const openManualChapter = (chapter: ManualChapter) => {
    setSelectedChapter(chapter);
    setManualOpen(true);
  };

  const faqs = [
    { questionKey: "help.faq1Question", answerKey: "help.faq1Answer" },
    { questionKey: "help.faq2Question", answerKey: "help.faq2Answer" },
    { questionKey: "help.faq3Question", answerKey: "help.faq3Answer" },
    { questionKey: "help.faq4Question", answerKey: "help.faq4Answer" },
    { questionKey: "help.faq5Question", answerKey: "help.faq5Answer" },
    { questionKey: "help.faq6Question", answerKey: "help.faq6Answer" },
    { questionKey: "help.faq7Question", answerKey: "help.faq7Answer" },
    { questionKey: "help.faq8Question", answerKey: "help.faq8Answer" },
    { questionKey: "help.faq9Question", answerKey: "help.faq9Answer" },
    { questionKey: "help.faq10Question", answerKey: "help.faq10Answer" },
    { questionKey: "help.faq11Question", answerKey: "help.faq11Answer" },
    { questionKey: "help.faq12Question", answerKey: "help.faq12Answer" },
    { questionKey: "help.faq13Question", answerKey: "help.faq13Answer" },
    { questionKey: "help.faq14Question", answerKey: "help.faq14Answer" },
    { questionKey: "help.faq15Question", answerKey: "help.faq15Answer" },
    { questionKey: "help.faq16Question", answerKey: "help.faq16Answer" },
    { questionKey: "help.faq17Question", answerKey: "help.faq17Answer" },
    { questionKey: "help.faq18Question", answerKey: "help.faq18Answer" },
    { questionKey: "help.faq19Question", answerKey: "help.faq19Answer" },
    { questionKey: "help.faq20Question", answerKey: "help.faq20Answer" },
  ];

  const changelog = [
    {
      version: "1.0.8",
      date: "2026-02-20",
      changes: [
        { type: "feature", textKey: "help.changelog108Feature1" },
        { type: "feature", textKey: "help.changelog108Feature2" },
        { type: "feature", textKey: "help.changelog108Feature3" },
        { type: "improvement", textKey: "help.changelog108Improvement1" },
        { type: "improvement", textKey: "help.changelog108Improvement2" },
      ],
    },
    {
      version: "1.0.7",
      date: "2026-02-16",
      changes: [
        { type: "feature", textKey: "help.changelog107Feature1" },
        { type: "feature", textKey: "help.changelog107Feature2" },
        { type: "feature", textKey: "help.changelog107Feature3" },
        { type: "improvement", textKey: "help.changelog107Improvement1" },
        { type: "improvement", textKey: "help.changelog107Improvement2" },
      ],
    },
    {
      version: "1.0.6",
      date: "2026-02-14",
      changes: [
        { type: "feature", textKey: "help.changelog106Feature1" },
        { type: "feature", textKey: "help.changelog106Feature2" },
        { type: "feature", textKey: "help.changelog106Feature3" },
        { type: "feature", textKey: "help.changelog106Feature4" },
        { type: "improvement", textKey: "help.changelog106Improvement1" },
        { type: "improvement", textKey: "help.changelog106Improvement2" },
      ],
    },
    {
      version: "1.0.5",
      date: "2026-02-11",
      changes: [
        { type: "feature", textKey: "help.changelog105Feature1" },
        { type: "feature", textKey: "help.changelog105Feature2" },
        { type: "feature", textKey: "help.changelog105Feature3" },
        { type: "feature", textKey: "help.changelog105Feature4" },
        { type: "improvement", textKey: "help.changelog105Improvement1" },
      ],
    },
    {
      version: "1.0.4",
      date: "2026-02-09",
      changes: [
        { type: "feature", textKey: "help.changelog104Feature1" },
        { type: "feature", textKey: "help.changelog104Feature2" },
        { type: "feature", textKey: "help.changelog104Feature3" },
        { type: "feature", textKey: "help.changelog104Feature4" },
        { type: "improvement", textKey: "help.changelog104Improvement1" },
        { type: "improvement", textKey: "help.changelog104Improvement2" },
      ],
    },
    {
      version: "1.0.3",
      date: "2026-02-09",
      changes: [
        { type: "feature", textKey: "help.changelog103Feature1" },
        { type: "feature", textKey: "help.changelog103Feature2" },
        { type: "feature", textKey: "help.changelog103Feature3" },
        { type: "feature", textKey: "help.changelog103Feature4" },
        { type: "improvement", textKey: "help.changelog103Improvement1" },
        { type: "improvement", textKey: "help.changelog103Improvement2" },
      ],
    },
    {
      version: "1.0.2",
      date: "2026-02-08",
      changes: [
        { type: "feature", textKey: "help.changelog102Feature1" },
        { type: "feature", textKey: "help.changelog102Feature2" },
        { type: "feature", textKey: "help.changelog102Feature3" },
        { type: "improvement", textKey: "help.changelog102Improvement1" },
      ],
    },
    {
      version: "1.0.1",
      date: "2026-02-08",
      changes: [
        { type: "feature", textKey: "help.changelog101Feature1" },
        { type: "feature", textKey: "help.changelog101Feature2" },
        { type: "improvement", textKey: "help.changelog101Improvement1" },
      ],
    },
    {
      version: "1.0.0",
      date: "2026-02-08",
      changes: [
        { type: "feature", textKey: "help.changelog100Feature1" },
        { type: "feature", textKey: "help.changelog100Feature2" },
        { type: "feature", textKey: "help.changelog100Feature3" },
      ],
    },
  ];

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-display font-bold">{t("help.title")}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t("help.subtitle")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  checkForUpdate();
                  if (!checking) {
                    setTimeout(() => {
                      if (!updateAvailable) {
                        toast.success("Sie verwenden bereits die neueste Version.");
                      }
                    }, 2500);
                  }
                }}
                disabled={checking}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${checking ? "animate-spin" : ""}`} />
                {checking ? "Prüfe..." : "Auf Update prüfen"}
              </Button>
              {updateAvailable && (
                <Button size="sm" onClick={applyUpdate}>
                  <Download className="h-4 w-4 mr-2" />
                  Update installieren
                </Button>
              )}
              <Badge variant="outline" className="text-xs">
                {t("help.version")} {APP_VERSION}
              </Badge>
            </div>
          </div>
        </header>
        <div className="p-6 space-y-6">
          {/* Getting Started */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Rocket className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{t("onboarding.gettingStarted")}</h3>
                    <p className="text-sm text-muted-foreground">{t("onboarding.gettingStartedDesc")}</p>
                  </div>
                </div>
                <Button onClick={() => navigate("/getting-started")} className="gap-2 w-full sm:w-auto">
                  <Rocket className="h-4 w-4" />
                  {t("onboarding.gettingStarted")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* User Manual */}
          <Card>
            <CardHeader className="px-6">
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                {t("help.userManual")}
              </CardTitle>
              <CardDescription>
                {t("help.userManualDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                <Button 
                  variant="outline" 
                  className="justify-start gap-3 h-auto py-4 px-5"
                  onClick={() => openManualChapter("gettingStarted")}
                >
                  <BookOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">{t("help.gettingStarted")}</p>
                    <p className="text-xs text-muted-foreground">{t("help.gettingStartedDesc")}</p>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  className="justify-start gap-3 h-auto py-4 px-5"
                  onClick={() => openManualChapter("locationManagement")}
                >
                  <BookOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">{t("help.locationManagement")}</p>
                    <p className="text-xs text-muted-foreground">{t("help.locationManagementDesc")}</p>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  className="justify-start gap-3 h-auto py-4 px-5"
                  onClick={() => openManualChapter("floorManagement")}
                >
                  <BookOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">{t("help.floorManagement" as any)}</p>
                    <p className="text-xs text-muted-foreground">{t("help.floorManagementDesc" as any)}</p>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  className="justify-start gap-3 h-auto py-4 px-5"
                  onClick={() => openManualChapter("energyAnalysis")}
                >
                  <BookOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">{t("help.energyAnalysis")}</p>
                    <p className="text-xs text-muted-foreground">{t("help.energyAnalysisDesc")}</p>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  className="justify-start gap-3 h-auto py-4 px-5"
                  onClick={() => openManualChapter("meterManagement")}
                >
                  <Gauge className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">Messstellen</p>
                    <p className="text-xs text-muted-foreground">Zähler anlegen, bearbeiten und archivieren</p>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  className="justify-start gap-3 h-auto py-4 px-5"
                  onClick={() => openManualChapter("mobileApp")}
                >
                  <Smartphone className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">Mobile App</p>
                    <p className="text-xs text-muted-foreground">Zählerablesung per App, QR-Code und KI</p>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  className="justify-start gap-3 h-auto py-4 px-5"
                  onClick={() => openManualChapter("automation")}
                >
                  <Cpu className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">Gebäudeautomation</p>
                    <p className="text-xs text-muted-foreground">Automationsregeln, Bedingungen und Aktoren</p>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  className="justify-start gap-3 h-auto py-4 px-5"
                  onClick={() => openManualChapter("evCharging")}
                >
                  <Zap className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">Ladeinfrastruktur</p>
                    <p className="text-xs text-muted-foreground">Ladepunkte, Tarife, Abrechnung und Lade-App</p>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  className="justify-start gap-3 h-auto py-4 px-5"
                  onClick={() => openManualChapter("integrations")}
                >
                  <ExternalLink className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">Integrationen & Sync</p>
                    <p className="text-xs text-muted-foreground">BrightHub, Gateways und Datensynchronisation</p>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  className="justify-start gap-3 h-auto py-4 px-5"
                  onClick={() => openManualChapter("arbitrageTrading")}
                >
                  <TrendingUp className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">Arbitragehandel</p>
                    <p className="text-xs text-muted-foreground">Spotpreise, Speicher und Handelsstrategien</p>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>

          <UserManualContent 
            open={manualOpen} 
            onOpenChange={setManualOpen} 
            chapter={selectedChapter} 
          />

          {/* FAQ */}
          <Card>
            <CardHeader className="px-6">
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                {t("help.faq")}
              </CardTitle>
              <CardDescription>
                {t("help.faqDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`faq-${index}`}>
                    <AccordionTrigger className="text-left">
                      {t(faq.questionKey as any)}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {t(faq.answerKey as any)}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          {/* Remote Support */}
          <Card>
            <CardHeader className="px-6">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Remote-Support
              </CardTitle>
              <CardDescription>
                Aktivieren Sie den Remote-Zugriff, damit unser Support-Team Ihnen direkt helfen kann.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                <div className="space-y-1">
                  <p className="font-medium">Remote-Zugriff erlauben</p>
                  <p className="text-sm text-muted-foreground">
                    {remoteSupportEnabled
                      ? "Ein Support-Mitarbeiter kann aktuell auf Ihr System zugreifen."
                      : "Derzeit hat kein Support-Mitarbeiter Zugriff auf Ihr System."}
                  </p>
                </div>
                <Switch
                  checked={remoteSupportEnabled}
                  onCheckedChange={handleToggleRemoteSupport}
                  disabled={remoteSupportLoading}
                />
              </div>
            </CardContent>
          </Card>

          {/* Support Contact */}
          <Card>
            <CardHeader className="px-6">
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                {t("help.supportContact")}
              </CardTitle>
              <CardDescription>
                {t("help.supportContactDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/30">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{t("help.emailSupport")}</p>
                    <a 
                      href="mailto:support@smartenergyhub.de" 
                      className="text-sm text-accent hover:underline flex items-center gap-1"
                    >
                      support@smartenergyhub.de
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <p className="text-xs text-muted-foreground mt-1">{t("help.emailResponseTime")}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/30">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{t("help.phoneSupport")}</p>
                    <a 
                      href="tel:+4930123456789" 
                      className="text-sm text-accent hover:underline flex items-center gap-1"
                    >
                      +49 30 123 456 789
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <p className="text-xs text-muted-foreground mt-1">{t("help.phoneHours")}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Version History / Changelog - Collapsible */}
          <Card>
            <CardHeader className="px-6">
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                {t("help.versionHistory")}
              </CardTitle>
              <CardDescription>
                {t("help.versionHistoryDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <Accordion type="single" collapsible className="w-full" defaultValue="version-0">
                {changelog.map((release, idx) => (
                  <AccordionItem key={release.version} value={`version-${idx}`}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <Badge variant={idx === 0 ? "default" : "secondary"}>
                          v{release.version}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{release.date}</span>
                        {idx === 0 && (
                          <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                            Aktuell
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="space-y-2 pt-2 pl-2">
                        {release.changes.map((change, cIdx) => (
                          <li key={cIdx} className="flex items-start gap-2 text-sm">
                            <Badge 
                              variant="outline" 
                              className={
                                change.type === "feature" 
                                  ? "bg-green-500/10 text-green-600 border-green-500/20 shrink-0" 
                                  : change.type === "fix"
                                  ? "bg-blue-500/10 text-blue-600 border-blue-500/20 shrink-0"
                                  : "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 shrink-0"
                              }
                            >
                              {change.type === "feature" ? t("help.changeTypeFeature") : 
                               change.type === "fix" ? t("help.changeTypeFix") : t("help.changeTypeImprovement")}
                            </Badge>
                            <span className="text-foreground/80">{t(change.textKey as any)}</span>
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Help;
