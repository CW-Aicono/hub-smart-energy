import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, HelpCircle, Mail, Phone, History, ExternalLink } from "lucide-react";

const APP_VERSION = "1.0.1";

const Help = () => {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const faqs = [
    { questionKey: "help.faq1Question", answerKey: "help.faq1Answer" },
    { questionKey: "help.faq2Question", answerKey: "help.faq2Answer" },
    { questionKey: "help.faq3Question", answerKey: "help.faq3Answer" },
    { questionKey: "help.faq4Question", answerKey: "help.faq4Answer" },
    { questionKey: "help.faq5Question", answerKey: "help.faq5Answer" },
    { questionKey: "help.faq6Question", answerKey: "help.faq6Answer" },
  ];

  const changelog = [
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
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold">{t("help.title")}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t("help.subtitle")}
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              {t("help.version")} {APP_VERSION}
            </Badge>
          </div>
        </header>
        <div className="p-6 space-y-6">
          {/* User Manual */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                {t("help.userManual")}
              </CardTitle>
              <CardDescription>
                {t("help.userManualDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Button variant="outline" className="justify-start gap-2 h-auto py-4">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                  <div className="text-left">
                    <p className="font-medium">{t("help.gettingStarted")}</p>
                    <p className="text-xs text-muted-foreground">{t("help.gettingStartedDesc")}</p>
                  </div>
                </Button>
                <Button variant="outline" className="justify-start gap-2 h-auto py-4">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                  <div className="text-left">
                    <p className="font-medium">{t("help.locationManagement")}</p>
                    <p className="text-xs text-muted-foreground">{t("help.locationManagementDesc")}</p>
                  </div>
                </Button>
                <Button variant="outline" className="justify-start gap-2 h-auto py-4">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                  <div className="text-left">
                    <p className="font-medium">{t("help.floorManagement" as any)}</p>
                    <p className="text-xs text-muted-foreground">{t("help.floorManagementDesc" as any)}</p>
                  </div>
                </Button>
                <Button variant="outline" className="justify-start gap-2 h-auto py-4">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                  <div className="text-left">
                    <p className="font-medium">{t("help.energyAnalysis")}</p>
                    <p className="text-xs text-muted-foreground">{t("help.energyAnalysisDesc")}</p>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* FAQ */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                {t("help.faq")}
              </CardTitle>
              <CardDescription>
                {t("help.faqDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
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

          {/* Support Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                {t("help.supportContact")}
              </CardTitle>
              <CardDescription>
                {t("help.supportContactDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/30">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
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
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
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

          {/* Version History / Changelog */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                {t("help.versionHistory")}
              </CardTitle>
              <CardDescription>
                {t("help.versionHistoryDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {changelog.map((release) => (
                  <div key={release.version} className="relative pl-6 border-l-2 border-muted">
                    <div className="absolute -left-2 top-0 h-4 w-4 rounded-full bg-primary" />
                    <div className="flex items-center gap-3 mb-3">
                      <Badge variant="default">{t("help.version")} {release.version}</Badge>
                      <span className="text-sm text-muted-foreground">{release.date}</span>
                    </div>
                    <ul className="space-y-2">
                      {release.changes.map((change, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <Badge 
                            variant="outline" 
                            className={
                              change.type === "feature" 
                                ? "bg-green-500/10 text-green-600 border-green-500/20" 
                                : change.type === "fix"
                                ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                : "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
                            }
                          >
                            {change.type === "feature" ? t("help.changeTypeFeature") : 
                             change.type === "fix" ? t("help.changeTypeFix") : t("help.changeTypeImprovement")}
                          </Badge>
                          <span className="text-foreground/80">{t(change.textKey as any)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Help;
