import { useState, useMemo } from "react";
import DOMPurify from "dompurify";
import { useTranslation } from "@/hooks/useTranslation";
import { useOcppGuides } from "@/hooks/useOcppGuides";
import { useChargerModels } from "@/hooks/useChargerModels";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, PlugZap, BookOpen, Search, ExternalLink, Server, Shield, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

const OCPP_WS_URL_SHORT = "wss://ocpp.aicono.org";
const OCPP_WS_URL_LONG = `${import.meta.env.VITE_SUPABASE_URL?.replace("https://", "wss://")}/functions/v1/ocpp-ws-proxy`;
const OCPP_WS_URL = OCPP_WS_URL_SHORT;

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

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url + "/{OCPP_ID}");
    toast({ title: t("common.copied" as any) || "Kopiert!" });
  };

  return (
    <AppLayout>
      <div className="space-y-4 max-w-6xl mx-auto">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("ocppIntegration.title" as any)}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t("ocppIntegration.subtitle" as any)}</p>
        </div>

        {/* OCPP Backend URL Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2">
              <Server className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-xs font-medium">{t("ocppIntegration.backendUrl" as any)}</p>

                {/* Short URL (if configured) */}
                {OCPP_WS_URL_SHORT && (
                  <div>
                    <p className="text-[11px] font-medium text-primary mb-0.5">{t("ocppIntegration.shortUrl" as any)}</p>
                    <div className="flex items-center gap-1.5">
                      <code className="text-xs bg-background border rounded px-2 py-1.5 break-all select-all flex-1 font-semibold">
                        {OCPP_WS_URL_SHORT}/{"<OCPP_ID>"}
                      </code>
                      <Button variant="outline" size="icon" className="shrink-0 h-8 w-8" onClick={() => copyUrl(OCPP_WS_URL_SHORT)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Long URL */}
                <div>
                  {OCPP_WS_URL_SHORT && (
                    <p className="text-[11px] text-muted-foreground mb-0.5">{t("ocppIntegration.fullUrl" as any)}</p>
                  )}
                  <div className="flex items-center gap-1.5">
                    <code className="text-[11px] bg-background border rounded px-2 py-1.5 break-all select-all flex-1 text-muted-foreground">
                      {OCPP_WS_URL_LONG}/{"<OCPP_ID>"}
                    </code>
                    <Button variant="outline" size="icon" className="shrink-0 h-8 w-8" onClick={() => copyUrl(OCPP_WS_URL_LONG)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Port info */}
                <div className="p-2 bg-background border rounded-md">
                  <p className="text-[11px] font-medium mb-1">Port-Konfiguration</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <code className="font-semibold text-primary">wss://</code>
                      <span className="text-muted-foreground">→ Port</span>
                      <code className="font-bold">443</code>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <code className="font-semibold text-destructive">ws://</code>
                      <span className="text-muted-foreground">→ Port</span>
                      <code className="font-bold">80</code>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Für verschlüsselte Verbindungen (wss://) muss Port <strong>443</strong> verwendet werden. Port 80 gilt nur für unverschlüsseltes ws:// und sollte vermieden werden.
                  </p>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  {t("ocppIntegration.backendUrlHint" as any)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ws:// Cloud-Proxy für ältere Ladepunkte */}
        <Card className="border-yellow-500/20 bg-yellow-500/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-xs font-medium">ws:// für ältere Ladepunkte (ohne TLS)</p>
                <p className="text-[11px] text-muted-foreground">
                  Ältere Wallboxen ohne TLS-Unterstützung können sich über ws:// (unverschlüsselt) verbinden.
                  Der Cloud-Proxy leitet die Verbindung automatisch verschlüsselt (wss://) an das Backend weiter.
                </p>

                <div>
                  <p className="text-[11px] font-medium mb-0.5">Verbindungs-URL für ältere Wallboxen:</p>
                  <div className="flex items-center gap-1.5">
                    <code className="text-xs bg-background border rounded px-2 py-1.5 break-all select-all flex-1 font-semibold">
                      ws://ocpp.aicono.org/{"<OCPP_ID>"}
                    </code>
                    <Button variant="outline" size="icon" className="shrink-0 h-8 w-8" onClick={() => {
                      navigator.clipboard.writeText("ws://ocpp.aicono.org/{OCPP_ID}");
                      toast({ title: t("common.copied" as any) || "Kopiert!" });
                    }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-1.5 text-yellow-700 dark:text-yellow-400">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  <p className="text-[11px]">
                    Die Strecke Wallbox → Cloud ist unverschlüsselt (ws://). Die Strecke Cloud-Proxy → Backend ist verschlüsselt (wss://). Dieses Vorgehen entspricht dem Branchenstandard für ältere Ladepunkte.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={t("common.search" as any)}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select value={selectedVendor} onValueChange={(v) => { setSelectedVendor(v); setSelectedModel("all"); }}>
            <SelectTrigger className="w-full sm:w-[180px] h-8 text-sm">
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
              <SelectTrigger className="w-full sm:w-[180px] h-8 text-sm">
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
          <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <PlugZap className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-xs">{t("ocppIntegration.noResults" as any)}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((item) => (
              <Card
                key={item.id}
                className={`cursor-pointer transition-all hover:shadow-md ${expandedGuide === item.id ? "ring-2 ring-primary" : ""}`}
                onClick={() => setExpandedGuide(expandedGuide === item.id ? null : item.id)}
              >
                <CardHeader className="p-3 pb-1.5">
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground font-medium">{item.vendor}</p>
                      <CardTitle className="text-sm mt-0.5 truncate">{item.model}</CardTitle>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      {item.power_kw && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{item.power_kw} kW</Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase">{item.charging_type}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      OCPP {item.protocol || "1.6"}
                    </Badge>
                    {item.guide ? (
                      <Badge className={`text-[10px] px-1.5 py-0 ${DIFFICULTY_COLORS[item.guide.difficulty] || ""}`}>
                        <BookOpen className="h-2.5 w-2.5 mr-0.5" />
                        {t(`ocppIntegration.difficulty.${item.guide.difficulty}` as any)}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 opacity-60">
                        {t("ocppIntegration.noGuide" as any)}
                      </Badge>
                    )}
                  </div>

                  {/* Expanded guide content */}
                  {expandedGuide === item.id && item.guide && (
                    <div className="mt-3 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <div
                          className="text-xs leading-relaxed whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.guide.content_md) }}
                        />
                      </div>
                    </div>
                  )}

                  {expandedGuide === item.id && !item.guide && (
                    <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                      <p>{t("ocppIntegration.noGuideAvailable" as any)}</p>
                      <div className="mt-2 p-2 bg-muted rounded-md">
                        <p className="font-medium text-foreground mb-1 text-xs">{t("ocppIntegration.generalSteps" as any)}</p>
                        <ol className="list-decimal list-inside space-y-0.5 text-[11px]">
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
