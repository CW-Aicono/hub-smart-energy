import { useState, useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useOcppGuides } from "@/hooks/useOcppGuides";
import { useChargerModels } from "@/hooks/useChargerModels";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, PlugZap, BookOpen, Search, ExternalLink, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

const OCPP_WS_URL = import.meta.env.VITE_OCPP_WS_URL
  || `${import.meta.env.VITE_SUPABASE_URL?.replace("https://", "wss://")}/functions/v1/ocpp-ws-proxy`;

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  hard: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const OcppIntegration = () => {
  const { t } = useTranslation();
  const { guides, isLoading: guidesLoading, vendors: guideVendors } = useOcppGuides();
  const { chargerModels, isLoading: modelsLoading } = useChargerModels();

  const [selectedVendor, setSelectedVendor] = useState<string>("all");
  const [selectedModel, setSelectedModel] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  // Combine charger models + guides. Show all active charger models, mark those with guides.
  const allVendors = useMemo(() => {
    const v = new Set<string>();
    chargerModels.filter((m) => m.is_active).forEach((m) => v.add(m.vendor));
    guides.forEach((g) => v.add(g.vendor));
    return [...v].sort();
  }, [chargerModels, guides]);

  const modelsForVendor = useMemo(() => {
    if (selectedVendor === "all") return [];
    const models = new Set<string>();
    chargerModels
      .filter((m) => m.is_active && m.vendor === selectedVendor)
      .forEach((m) => models.add(m.model));
    guides
      .filter((g) => g.vendor === selectedVendor)
      .forEach((g) => models.add(g.model));
    return [...models].sort();
  }, [selectedVendor, chargerModels, guides]);

  const filteredItems = useMemo(() => {
    // Build a list of all charger models with their guides (if any)
    const activeModels = chargerModels.filter((m) => m.is_active);
    const items = activeModels.map((model) => {
      const guide = guides.find(
        (g) => g.charger_model_id === model.id || (g.vendor === model.vendor && g.model === model.model)
      );
      return { ...model, guide };
    });

    // Also add guides that don't match any active charger model
    guides.forEach((g) => {
      if (!items.find((i) => i.vendor === g.vendor && i.model === g.model)) {
        items.push({
          id: g.id,
          vendor: g.vendor,
          model: g.model,
          protocol: g.ocpp_version,
          notes: null,
          is_active: true,
          power_kw: null,
          charging_type: "ac",
          created_at: g.created_at,
          updated_at: g.updated_at,
          guide: g,
        });
      }
    });

    return items
      .filter((i) => selectedVendor === "all" || i.vendor === selectedVendor)
      .filter((i) => selectedModel === "all" || i.model === selectedModel)
      .filter((i) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return i.vendor.toLowerCase().includes(s) || i.model.toLowerCase().includes(s);
      })
      .sort((a, b) => a.vendor.localeCompare(b.vendor) || a.model.localeCompare(b.model));
  }, [chargerModels, guides, selectedVendor, selectedModel, search]);

  const isLoading = guidesLoading || modelsLoading;

  const copyUrl = () => {
    navigator.clipboard.writeText(OCPP_WS_URL + "/{OCPP_ID}");
    toast({ title: t("common.copied" as any) || "Kopiert!" });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("ocppIntegration.title" as any)}</h1>
          <p className="text-muted-foreground mt-1">{t("ocppIntegration.subtitle" as any)}</p>
        </div>

        {/* OCPP Backend URL Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Server className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium mb-1">{t("ocppIntegration.backendUrl" as any)}</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-background border rounded px-3 py-2 break-all select-all flex-1">
                    {OCPP_WS_URL}/{"<OCPP_ID>"}
                  </code>
                  <Button variant="outline" size="icon" className="shrink-0" onClick={copyUrl}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {t("ocppIntegration.backendUrlHint" as any)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("common.search" as any)}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={selectedVendor} onValueChange={(v) => { setSelectedVendor(v); setSelectedModel("all"); }}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder={t("ocppIntegration.allVendors" as any)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("ocppIntegration.allVendors" as any)}</SelectItem>
              {allVendors.map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedVendor !== "all" && modelsForVendor.length > 0 && (
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder={t("ocppIntegration.allModels" as any)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("ocppIntegration.allModels" as any)}</SelectItem>
                {modelsForVendor.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-36 rounded-lg" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <PlugZap className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">{t("ocppIntegration.noResults" as any)}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => (
              <Card
                key={item.id}
                className={`cursor-pointer transition-all hover:shadow-md ${expandedGuide === item.id ? "ring-2 ring-primary" : ""}`}
                onClick={() => setExpandedGuide(expandedGuide === item.id ? null : item.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">{item.vendor}</p>
                      <CardTitle className="text-base mt-0.5">{item.model}</CardTitle>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {item.power_kw && (
                        <Badge variant="secondary" className="text-xs">{item.power_kw} kW</Badge>
                      )}
                      <Badge variant="outline" className="text-xs uppercase">{item.charging_type}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      OCPP {item.protocol || "1.6"}
                    </Badge>
                    {item.guide ? (
                      <Badge className={`text-xs ${DIFFICULTY_COLORS[item.guide.difficulty] || ""}`}>
                        <BookOpen className="h-3 w-3 mr-1" />
                        {t(`ocppIntegration.difficulty.${item.guide.difficulty}` as any)}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs opacity-60">
                        {t("ocppIntegration.noGuide" as any)}
                      </Badge>
                    )}
                  </div>

                  {/* Expanded guide content */}
                  {expandedGuide === item.id && item.guide && (
                    <div className="mt-4 pt-4 border-t" onClick={(e) => e.stopPropagation()}>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <div
                          className="text-sm leading-relaxed whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{ __html: item.guide.content_md }}
                        />
                      </div>
                    </div>
                  )}

                  {expandedGuide === item.id && !item.guide && (
                    <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
                      <p>{t("ocppIntegration.noGuideAvailable" as any)}</p>
                      <div className="mt-3 p-3 bg-muted rounded-md">
                        <p className="font-medium text-foreground mb-1">{t("ocppIntegration.generalSteps" as any)}</p>
                        <ol className="list-decimal list-inside space-y-1 text-xs">
                          <li>{t("ocppIntegration.step1" as any)}</li>
                          <li>{t("ocppIntegration.step2" as any)}</li>
                          <li>{t("ocppIntegration.step3" as any)}</li>
                          <li>{t("ocppIntegration.step4" as any)}</li>
                        </ol>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default OcppIntegration;
