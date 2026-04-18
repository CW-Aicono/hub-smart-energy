import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SalesLayout, SalesFab } from "@/components/sales/SalesLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, ChevronRight, MapPin } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface SalesProject {
  id: string;
  kunde_name: string;
  kontakt_name: string | null;
  status: string;
  adresse: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Entwurf", variant: "secondary" },
  sent: { label: "Versendet", variant: "default" },
  accepted: { label: "Angenommen", variant: "default" },
  rejected: { label: "Abgelehnt", variant: "destructive" },
  converted: { label: "Konvertiert", variant: "outline" },
};

export default function SalesProjects() {
  const [projects, setProjects] = useState<SalesProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("sales_projects")
        .select("id, kunde_name, kontakt_name, status, adresse, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (!error && data) setProjects(data as unknown as SalesProject[]);
      setLoading(false);
    })();
  }, []);

  return (
    <SalesLayout title="Meine Projekte">
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <Briefcase className="h-12 w-12 mx-auto text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold">Noch keine Projekte</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Lege dein erstes Vertriebsprojekt an, um loszulegen.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => {
            const status = STATUS_LABELS[p.status] ?? { label: p.status, variant: "outline" as const };
            return (
              <Link key={p.id} to={`/sales/${p.id}`}>
                <Card className="hover:bg-accent/40 transition cursor-pointer">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">{p.kunde_name}</h3>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      {p.adresse && (
                        <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">{p.adresse}</span>
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        {format(new Date(p.updated_at), "dd. MMM yyyy, HH:mm", { locale: de })}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      <SalesFab to="/sales/new" label="Neues Projekt" />
    </SalesLayout>
  );
}
