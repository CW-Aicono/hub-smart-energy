import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SalesLayout } from "@/components/sales/SalesLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Zap, Boxes, FileText, Trash2, MapPin, ChevronRight, Box, Camera } from "lucide-react";
import { DistributionSheet } from "@/components/sales/DistributionSheet";
import { MeasurementPointSheet } from "@/components/sales/MeasurementPointSheet";
import { DeviceRecommendation } from "@/components/sales/DeviceRecommendation";
import { QuoteBuilderSheet } from "@/components/sales/QuoteBuilderSheet";
import { QuotesList } from "@/components/sales/QuotesList";
import { DistributionHardwareList } from "@/components/sales/DistributionHardwareList";
import { ConvertProjectDialog } from "@/components/sales/ConvertProjectDialog";
import { ClassBadge, CLASS_LABELS } from "@/components/sales/ClassBadge";
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

interface Project {
  id: string;
  kunde_name: string;
  kunde_typ: string;
  kontakt_name: string | null;
  adresse: string | null;
  status: string;
  notizen: string | null;
  converted_tenant_id: string | null;
}

interface Distribution {
  id: string;
  name: string;
  typ: string;
  standort: string | null;
  notizen: string | null;
  foto_url: string | null;
  ki_analyse: Record<string, unknown> | null;
}

interface MeasurementPoint {
  id: string;
  distribution_id: string;
  bezeichnung: string;
  energieart: string;
  phasen: number;
  strombereich_a: number | null;
  anwendungsfall: string | null;
  hinweise: string | null;
  montage: string | null;
  bestand: boolean;
  bestand_geraet: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Entwurf",
  sent: "Versendet",
  accepted: "Angenommen",
  rejected: "Abgelehnt",
  converted: "Konvertiert",
};

export default function SalesProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [points, setPoints] = useState<MeasurementPoint[]>([]);
  const [classCounts, setClassCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [distSheet, setDistSheet] = useState<{ open: boolean; editing?: Distribution | null }>({ open: false });
  const [pointSheet, setPointSheet] = useState<{ open: boolean; distributionId?: string; editing?: MeasurementPoint | null }>({ open: false });
  const [hardwareOpenFor, setHardwareOpenFor] = useState<string | null>(null);
  const [quoteSheet, setQuoteSheet] = useState(false);
  const [quotesReload, setQuotesReload] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    const [prRes, distRes] = await Promise.all([
      supabase.from("sales_projects").select("id, kunde_name, kunde_typ, kontakt_name, adresse, status, notizen, converted_tenant_id").eq("id", id).maybeSingle(),
      supabase.from("sales_distributions").select("id, name, typ, standort, notizen, foto_url, ki_analyse").eq("project_id", id).order("created_at", { ascending: true }),
    ]);
    setProject((prRes.data as unknown) as Project | null);
    const dist = (distRes.data ?? []) as unknown as Distribution[];
    setDistributions(dist);

    const distIds = dist.map((d) => d.id);
    if (distIds.length > 0) {
      const { data: mp } = await supabase
        .from("sales_measurement_points")
        .select("id, distribution_id, bezeichnung, energieart, phasen, strombereich_a, anwendungsfall, hinweise, montage, bestand, bestand_geraet")
        .in("distribution_id", distIds)
        .order("created_at", { ascending: true });
      const ptList = (mp ?? []) as unknown as MeasurementPoint[];
      setPoints(ptList);

      const ptIds = ptList.map((p) => p.id);
      if (ptIds.length > 0) {
        const { data: recs } = await supabase
          .from("sales_recommended_devices")
          .select("geraete_klasse, device_catalog:device_catalog_id(geraete_klasse)")
          .in("measurement_point_id", ptIds)
          .eq("ist_alternativ", false);
        const counts: Record<string, number> = {};
        for (const r of (recs ?? []) as any[]) {
          const k = r.device_catalog?.geraete_klasse ?? r.geraete_klasse ?? "misc";
          counts[k] = (counts[k] ?? 0) + 1;
        }
        setClassCounts(counts);
      } else {
        setClassCounts({});
      }
    } else {
      setPoints([]);
      setClassCounts({});
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeleteDistribution = async (distId: string) => {
    const { error } = await supabase.from("sales_distributions").delete().eq("id", distId);
    if (error) {
      toast.error("Löschen fehlgeschlagen", { description: error.message });
      return;
    }
    toast.success("Verteilung gelöscht");
    load();
  };

  const handleDeletePoint = async (pointId: string) => {
    const { error } = await supabase.from("sales_measurement_points").delete().eq("id", pointId);
    if (error) {
      toast.error("Löschen fehlgeschlagen", { description: error.message });
      return;
    }
    toast.success("Messpunkt gelöscht");
    load();
  };

  const handleDeleteProject = async () => {
    if (!id) return;
    const { error } = await supabase.from("sales_projects").delete().eq("id", id);
    if (error) {
      toast.error("Löschen fehlgeschlagen", { description: error.message });
      return;
    }
    toast.success("Projekt gelöscht");
    navigate("/sales");
  };

  if (loading) {
    return (
      <SalesLayout title="Lädt…" showBack backTo="/sales">
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </SalesLayout>
    );
  }

  if (!project) {
    return (
      <SalesLayout title="Nicht gefunden" showBack backTo="/sales">
        <div className="text-center py-16 text-muted-foreground">Projekt nicht gefunden.</div>
      </SalesLayout>
    );
  }

  return (
    <SalesLayout
      title={project.kunde_name}
      showBack
      backTo="/sales"
      action={
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Projekt löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Alle Verteilungen, Messpunkte und Empfehlungen werden gelöscht.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteProject}>Löschen</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      }
    >
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{project.kunde_name}</h2>
              <div className="flex gap-1">
                <Badge variant="outline" className="text-xs">
                  {project.kunde_typ === "industry" ? "Industrie" : "Standard"}
                </Badge>
                <Badge variant="secondary">{STATUS_LABELS[project.status] ?? project.status}</Badge>
              </div>
            </div>
            {project.kontakt_name && (
              <p className="text-sm text-muted-foreground">{project.kontakt_name}</p>
            )}
            {project.adresse && (
              <div className="text-sm flex items-start gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="whitespace-pre-line">{project.adresse}</div>
              </div>
            )}
            {project.notizen && (
              <p className="text-sm text-muted-foreground italic border-l-2 pl-2 mt-2">{project.notizen}</p>
            )}
            {Object.keys(classCounts).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t mt-2">
                {Object.entries(classCounts).map(([k, n]) => (
                  <div key={k} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ClassBadge klasse={k} />
                    <span>{n}× {CLASS_LABELS[k] ?? k}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Boxes className="h-4 w-4" />
              Verteilungen
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setDistSheet({ open: true, editing: null })}>
              <Plus className="h-4 w-4 mr-1" /> Neu
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {distributions.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                Noch keine Verteilungen. Lege eine NSHV oder UV an, um Messpunkte zu erfassen.
              </div>
            ) : (
              distributions.map((d) => {
                const dPoints = points.filter((p) => p.distribution_id === d.id);
                return (
                  <div key={d.id} className="rounded-lg border bg-card/50">
                    <div className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Box className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium truncate">{d.name}</span>
                          <Badge variant="outline" className="text-xs">{d.typ}</Badge>
                          {d.foto_url && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <Camera className="h-3 w-3" /> Foto
                            </Badge>
                          )}
                          {d.ki_analyse && (
                            <Badge variant="secondary" className="text-xs">KI</Badge>
                          )}
                        </div>
                        {d.standort && (
                          <p className="text-xs text-muted-foreground mt-1">{d.standort}</p>
                        )}
                        {d.notizen && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.notizen}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setDistSheet({ open: true, editing: d })}>
                          Bearbeiten
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Verteilung löschen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Alle zugehörigen Messpunkte werden ebenfalls gelöscht.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteDistribution(d.id)}>Löschen</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    <div className="border-t bg-background/50 px-3 py-2 space-y-3">
                      <DistributionHardwareList
                        distributionId={d.id}
                        hideAddButton
                        addOpen={hardwareOpenFor === d.id}
                        onAddOpenChange={(o) => setHardwareOpenFor(o ? d.id : null)}
                      />
                      {dPoints.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-1">Noch keine Messpunkte.</p>
                      ) : (
                        dPoints.map((p) => (
                          <div key={p.id} className="rounded-md bg-card border space-y-0">
                            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                              <button
                                className="flex-1 min-w-0 text-left flex items-center gap-2"
                                onClick={() => setPointSheet({ open: true, distributionId: d.id, editing: p })}
                              >
                                <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium truncate">{p.bezeichnung}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {p.energieart} · {p.phasen}-phasig
                                    {p.strombereich_a ? ` · ≤${p.strombereich_a}A` : ""}
                                    {p.anwendungsfall ? ` · ${p.anwendungsfall}` : ""}
                                    {p.bestand ? " · Bestand" : ""}
                                  </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7">
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Messpunkt löschen?</AlertDialogTitle>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeletePoint(p.id)}>Löschen</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                            {!p.bestand && (
                              <div className="border-t px-2 py-2 bg-muted/30">
                                <DeviceRecommendation measurementPointId={p.id} />
                              </div>
                            )}
                          </div>
                        ))
                      )}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPointSheet({ open: true, distributionId: d.id, editing: null })}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Messpunkt
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setHardwareOpenFor(d.id)}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Hardware
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Angebote
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <QuotesList
              projectId={id!}
              reloadKey={quotesReload}
              onCreate={() => setQuoteSheet(true)}
            />
            <ConvertProjectDialog
              projectId={id!}
              alreadyConverted={!!project.converted_tenant_id}
              convertedTenantId={project.converted_tenant_id}
              onConverted={load}
            />
          </CardContent>
        </Card>
      </div>

      <DistributionSheet
        open={distSheet.open}
        onOpenChange={(o) => setDistSheet({ open: o })}
        projektId={id!}
        editing={distSheet.editing ?? null}
        onSaved={load}
      />

      <MeasurementPointSheet
        open={pointSheet.open}
        onOpenChange={(o) => setPointSheet({ open: o })}
        distributionId={pointSheet.distributionId ?? ""}
        editing={pointSheet.editing ?? null}
        onSaved={load}
      />

      <QuoteBuilderSheet
        open={quoteSheet}
        onOpenChange={setQuoteSheet}
        projectId={id!}
        kundeTyp={(project.kunde_typ as "standard" | "industry") ?? "standard"}
        onGenerated={() => setQuotesReload((k) => k + 1)}
      />
    </SalesLayout>
  );
}
