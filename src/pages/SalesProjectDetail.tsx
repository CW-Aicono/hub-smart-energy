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
  const [loading, setLoading] = useState(true);
  const [distSheet, setDistSheet] = useState<{ open: boolean; editing?: Distribution | null }>({ open: false });
  const [pointSheet, setPointSheet] = useState<{ open: boolean; distributionId?: string; editing?: MeasurementPoint | null }>({ open: false });

  const load = useCallback(async () => {
    if (!id) return;
    const [prRes, distRes] = await Promise.all([
      supabase.from("sales_projects").select("id, kunde_name, kunde_typ, kontakt_name, adresse, status, notizen").eq("id", id).maybeSingle(),
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
      setPoints((mp ?? []) as unknown as MeasurementPoint[]);
    } else {
      setPoints([]);
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
                        <div className="flex items-center gap-2">
                          <Box className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium truncate">{d.name}</span>
                          <Badge variant="outline" className="text-xs">{d.typ}</Badge>
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

                    <div className="border-t bg-background/50 px-3 py-2 space-y-2">
                      {dPoints.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-1">Noch keine Messpunkte.</p>
                      ) : (
                        dPoints.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-2 rounded-md bg-card px-2 py-1.5"
                          >
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
                        ))
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => setPointSheet({ open: true, distributionId: d.id, editing: null })}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Messpunkt
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardContent className="p-4 flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium text-sm">Angebot generieren</div>
              <div className="text-xs text-muted-foreground">Verfügbar in Iteration 4</div>
            </div>
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
    </SalesLayout>
  );
}
