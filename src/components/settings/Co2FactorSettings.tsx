import { useState } from "react";
import { useCo2Factors, Co2Factor } from "@/hooks/useCo2Factors";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, Leaf } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ENERGY_TYPES = [
  { value: "strom", label: "Strom" },
  { value: "gas", label: "Erdgas" },
  { value: "waerme", label: "Fernwärme" },
  { value: "oel", label: "Heizöl" },
  { value: "pellets", label: "Pellets" },
];

const DEFAULT_FACTORS: Record<string, { kg: number; source: string }> = {
  strom: { kg: 0.420, source: "UBA 2023" },
  gas: { kg: 0.201, source: "GEMIS" },
  waerme: { kg: 0.180, source: "Durchschnitt" },
  oel: { kg: 0.266, source: "GEMIS" },
  pellets: { kg: 0.023, source: "GEMIS" },
};

export function Co2FactorSettings() {
  const { factors, upsertFactor, deleteFactor, loading } = useCo2Factors();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Record<string, Partial<Co2Factor>>>({});

  const handleSave = async (factor: Partial<Co2Factor> & { energy_type: string }) => {
    const { error } = await upsertFactor(factor);
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("common.success"), description: t("common.saved") });
      setEditing((prev) => {
        const next = { ...prev };
        delete next[factor.energy_type];
        return next;
      });
    }
  };

  const initDefaults = async () => {
    for (const [type, def] of Object.entries(DEFAULT_FACTORS)) {
      if (!factors.find((f) => f.energy_type === type)) {
        await upsertFactor({
          energy_type: type,
          factor_kg_per_kwh: def.kg,
          source: def.source,
          valid_from: "2023-01-01",
          is_default: true,
        });
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Leaf className="h-5 w-5" />
              {t("co2.title" as any) || "CO₂-Emissionsfaktoren"}
            </CardTitle>
            <CardDescription>
              {t("co2.description" as any) || "Faktoren zur Berechnung der CO₂-Emissionen pro Energieträger"}
            </CardDescription>
          </div>
          {factors.length === 0 && (
            <Button variant="outline" size="sm" onClick={initDefaults}>
              <Plus className="h-4 w-4 mr-2" />
              {t("co2.initDefaults" as any) || "Standardwerte laden"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("co2.energyType" as any) || "Energieträger"}</TableHead>
              <TableHead>{t("co2.factorKgKwh" as any) || "kg CO₂/kWh"}</TableHead>
              <TableHead>{t("co2.source" as any) || "Quelle"}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {factors.map((factor) => (
              <TableRow key={factor.id}>
                <TableCell className="font-medium capitalize">{factor.energy_type}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.001"
                    className="w-28"
                    defaultValue={factor.factor_kg_per_kwh}
                    onChange={(e) =>
                      setEditing((prev) => ({
                        ...prev,
                        [factor.energy_type]: {
                          ...factor,
                          ...prev[factor.energy_type],
                          factor_kg_per_kwh: parseFloat(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="w-40"
                    defaultValue={factor.source || ""}
                    onChange={(e) =>
                      setEditing((prev) => ({
                        ...prev,
                        [factor.energy_type]: {
                          ...factor,
                          ...prev[factor.energy_type],
                          source: e.target.value,
                        },
                      }))
                    }
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {editing[factor.energy_type] && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSave(editing[factor.energy_type] as any)}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={async () => {
                        await deleteFactor(factor.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {factors.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  {t("co2.noFactors" as any) || "Keine Emissionsfaktoren hinterlegt. Laden Sie die Standardwerte."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
