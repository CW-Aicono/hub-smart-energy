import { useState } from "react";
import { Link } from "react-router-dom";
import { useLocations, type Location } from "@/hooks/useLocations";
import { useTranslation } from "@/hooks/useTranslation";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AddLocationDialog } from "@/components/locations/AddLocationDialog";
import { Building2, Landmark, Unlink } from "lucide-react";

/** Gebäude eines Gebäudekomplexes: anzeigen, neu anlegen, bestehende zuordnen oder lösen. */
export function ComplexBuildingsCard({ complex }: { complex: Location }) {
  const { locations, updateLocation, refetch } = useLocations();
  const { t } = useTranslation();
  const T = (k: string) => t(k as any);
  const { isAdmin } = useUserRole();
  const { toast } = useToast();
  const [pick, setPick] = useState<string>("");

  const children = locations.filter((l) => l.parent_id === complex.id);
  const assignable = locations.filter((l) => l.id !== complex.id && !l.parent_id && l.type !== "gebaeudekomplex");

  const setParent = async (id: string, parent: string | null) => {
    const { error } = await updateLocation(id, { parent_id: parent } as any);
    if (error) toast({ title: T("common.error"), description: error.message, variant: "destructive" });
    else { setPick(""); refetch?.(); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" />{T("complex.buildingsTitle")}</CardTitle>
          <CardDescription>{T("complex.buildingsDesc")}</CardDescription>
        </div>
        {isAdmin && <AddLocationDialog parentId={complex.id} triggerLabel={T("complex.addBuilding")} />}
      </CardHeader>
      <CardContent className="space-y-3">
        {children.length === 0 ? (
          <p className="text-sm text-muted-foreground">{T("complex.noBuildings")}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {children.map((c) => (
              <li key={c.id} className="flex items-center gap-3 p-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <Link to={`/locations/${c.id}`} className="flex-1 font-medium hover:underline">{c.name}</Link>
                {isAdmin && (
                  <Button variant="ghost" size="sm" onClick={() => setParent(c.id, null)}>
                    <Unlink className="h-4 w-4 mr-1" />{T("complex.detach")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {isAdmin && assignable.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger className="w-72"><SelectValue placeholder={T("complex.assignExisting")} /></SelectTrigger>
              <SelectContent>{assignable.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={!pick} onClick={() => setParent(pick, complex.id)}>{T("complex.assign")}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
