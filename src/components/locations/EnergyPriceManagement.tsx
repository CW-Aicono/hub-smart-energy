import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Euro, Plus, Pencil, Trash2, Zap } from "lucide-react";
import { useEnergyPrices, EnergyPrice } from "@/hooks/useEnergyPrices";
import { useTenant } from "@/hooks/useTenant";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useSpotPrices } from "@/hooks/useSpotPrices";

const ENERGY_TYPE_LABELS: Record<string, string> = {
  strom: "Strom",
  gas: "Gas",
  waerme: "Wärme",
  wasser: "Wasser",
};

const ENERGY_TYPE_UNITS: Record<string, string> = {
  strom: "kWh",
  gas: "m³",
  waerme: "kWh",
  wasser: "m³",
};

interface EnergyPriceManagementProps {
  locationId: string;
}

export function EnergyPriceManagement({ locationId }: EnergyPriceManagementProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPrice, setEditingPrice] = useState<EnergyPrice | null>(null);
  const { prices, loading, addPrice, updatePrice, deletePrice } = useEnergyPrices(locationId);
  const { tenant } = useTenant();
  const { currentPrice: currentSpotPrice } = useSpotPrices();

  const [formData, setFormData] = useState({
    energy_type: "strom",
    price_per_unit: "",
    valid_from: new Date().toISOString().split("T")[0],
    is_dynamic: false,
    spot_markup_per_unit: "",
  });

  const openAddDialog = () => {
    setEditingPrice(null);
    setFormData({
      energy_type: "strom",
      price_per_unit: "",
      valid_from: new Date().toISOString().split("T")[0],
      is_dynamic: false,
      spot_markup_per_unit: "",
    });
    setDialogOpen(true);
  };

  const openEditDialog = (price: EnergyPrice) => {
    setEditingPrice(price);
    setFormData({
      energy_type: price.energy_type,
      price_per_unit: String(price.price_per_unit),
      valid_from: price.valid_from,
      is_dynamic: price.is_dynamic ?? false,
      spot_markup_per_unit: price.spot_markup_per_unit ? String(price.spot_markup_per_unit) : "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const isDynamic = formData.is_dynamic && formData.energy_type === "strom";
    const markupValue = parseFloat((formData.spot_markup_per_unit || "0").replace(",", "."));

    if (isDynamic) {
      if (isNaN(markupValue) || markupValue < 0) return;
    } else {
      const priceValue = parseFloat(formData.price_per_unit.replace(",", "."));
      if (isNaN(priceValue) || priceValue < 0) return;
    }

    const priceValue = isDynamic ? 0 : parseFloat(formData.price_per_unit.replace(",", "."));

    if (editingPrice) {
      await updatePrice(editingPrice.id, {
        energy_type: formData.energy_type,
        price_per_unit: priceValue,
        unit: ENERGY_TYPE_UNITS[formData.energy_type] || "kWh",
        valid_from: formData.valid_from,
        is_dynamic: isDynamic,
        spot_markup_per_unit: isDynamic ? markupValue : 0,
      });
    } else {
      await addPrice({
        location_id: locationId,
        energy_type: formData.energy_type,
        price_per_unit: priceValue,
        unit: ENERGY_TYPE_UNITS[formData.energy_type] || "kWh",
        valid_from: formData.valid_from,
        tenant_id: tenant?.id || "",
        is_dynamic: isDynamic,
        spot_markup_per_unit: isDynamic ? markupValue : 0,
      });
    }
    setDialogOpen(false);
  };

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-left group">
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Euro className="h-5 w-5" />
                    Energiepreise
                  </CardTitle>
                  <CardDescription>
                    Preise pro Energieträger für die Kostenberechnung
                  </CardDescription>
                </div>
              </button>
            </CollapsibleTrigger>
            <Button size="sm" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-1" />
              Preis hinzufügen
            </Button>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              {loading ? (
                <Skeleton className="h-24" />
              ) : prices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Noch keine Energiepreise hinterlegt
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Energieträger</TableHead>
                      <TableHead>Preis</TableHead>
                      <TableHead>Gültig ab</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prices.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {ENERGY_TYPE_LABELS[p.energy_type] || p.energy_type}
                            {p.is_dynamic && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5"><Zap className="h-2.5 w-2.5" />Dynamisch</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {p.is_dynamic ? (
                            <span className="text-sm">
                              Spot + {Number(p.spot_markup_per_unit).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/{p.unit}
                              {currentSpotPrice && (
                                <span className="text-muted-foreground ml-1">
                                  (aktuell {((currentSpotPrice.price_eur_mwh / 1000) + Number(p.spot_markup_per_unit)).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/{p.unit})
                                </span>
                              )}
                            </span>
                          ) : (
                            <>{Number(p.price_per_unit).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/{p.unit}</>
                          )}
                        </TableCell>
                        <TableCell>{new Date(p.valid_from).toLocaleDateString("de-DE")}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(p)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deletePrice(p.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPrice ? "Energiepreis bearbeiten" : "Energiepreis hinzufügen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Energieträger</Label>
              <Select value={formData.energy_type} onValueChange={(v) => setFormData({ ...formData, energy_type: v, is_dynamic: v !== "strom" ? false : formData.is_dynamic })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ENERGY_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formData.energy_type === "strom" && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-1.5"><Zap className="h-4 w-4" />Dynamischer Strompreis (Börse)</Label>
                  <p className="text-xs text-muted-foreground">Preis basiert auf dem EPEX Day-Ahead Spotpreis</p>
                </div>
                <Switch checked={formData.is_dynamic} onCheckedChange={(checked) => setFormData({ ...formData, is_dynamic: checked })} />
              </div>
            )}
            {formData.is_dynamic && formData.energy_type === "strom" ? (
              <div>
                <Label>Aufschlag pro kWh (€) – Netzentgelte, Umlagen, Marge</Label>
                <Input
                  type="text"
                  placeholder="0,12"
                  value={formData.spot_markup_per_unit}
                  onChange={(e) => setFormData({ ...formData, spot_markup_per_unit: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Der Strompreis wird automatisch anhand des aktuellen EPEX Day-Ahead Spotpreises berechnet. Der Aufschlag deckt Netzentgelte, Umlagen und die Marge des Lieferanten ab.
                </p>
              </div>
            ) : (
              <div>
                <Label>Preis pro {ENERGY_TYPE_UNITS[formData.energy_type]} (€)</Label>
                <Input
                  type="text"
                  placeholder="0,30"
                  value={formData.price_per_unit}
                  onChange={(e) => setFormData({ ...formData, price_per_unit: e.target.value })}
                />
              </div>
            )}
            <div>
              <Label>Gültig ab</Label>
              <Input
                type="date"
                value={formData.valid_from}
                onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSave}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
