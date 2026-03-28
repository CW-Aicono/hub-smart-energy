import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Euro, Plus, Pencil, Trash2, Zap, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useTranslation } from "@/hooks/useTranslation";
import { useEnergyPrices, EnergyPrice } from "@/hooks/useEnergyPrices";
import { useMeters } from "@/hooks/useMeters";
import { useTenant } from "@/hooks/useTenant";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useSpotPrices } from "@/hooks/useSpotPrices";

const ENERGY_TYPE_KEYS: Record<string, string> = {
  strom: "ep.strom",
  gas: "ep.gas",
  waerme: "ep.waerme",
  wasser: "ep.wasser",
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
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPrice, setEditingPrice] = useState<EnergyPrice | null>(null);
  const { prices, loading, addPrice, updatePrice, deletePrice } = useEnergyPrices(locationId);
  const { meters } = useMeters(locationId);
  const { tenant } = useTenant();
  const { currentPrice: currentSpotPrice } = useSpotPrices();

  // Only main meters (is_main_meter or no parent) can have prices assigned
  const mainMeters = meters.filter((m) => m.is_main_meter || !m.parent_meter_id);

  const [formData, setFormData] = useState({
    energy_type: "strom",
    price_per_unit: "",
    valid_from: new Date().toISOString().split("T")[0],
    is_dynamic: false,
    spot_markup_per_unit: "",
    meter_id: "" as string,
    direction: "consumption" as "consumption" | "feed_in",
  });

  const openAddDialog = () => {
    setEditingPrice(null);
    setFormData({
      energy_type: "strom",
      price_per_unit: "",
      valid_from: new Date().toISOString().split("T")[0],
      is_dynamic: false,
      spot_markup_per_unit: "",
      meter_id: "",
      direction: "consumption",
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
      meter_id: price.meter_id ?? "",
      direction: price.direction ?? "consumption",
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
    const meterId = formData.meter_id || null;

    if (editingPrice) {
      await updatePrice(editingPrice.id, {
        energy_type: formData.energy_type,
        price_per_unit: priceValue,
        unit: ENERGY_TYPE_UNITS[formData.energy_type] || "kWh",
        valid_from: formData.valid_from,
        is_dynamic: isDynamic,
        spot_markup_per_unit: isDynamic ? markupValue : 0,
        meter_id: meterId,
        direction: formData.direction,
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
        meter_id: meterId,
        direction: formData.direction,
      });
    }
    setDialogOpen(false);
  };

  const getMeterName = (meterId: string | null) => {
    if (!meterId) return null;
    const meter = meters.find((m) => m.id === meterId);
    return meter?.name ?? meterId;
  };

  // Filter main meters by selected energy type for the dropdown
  const metersForEnergyType = mainMeters.filter(
    (m) => m.energy_type === formData.energy_type
  );

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
                    {T("ep.sectionTitle")}
                    <HelpTooltip text={T("tooltip.energyPrices")} />
                  </CardTitle>
                  <CardDescription>
                    {T("ep.sectionDesc")}
                  </CardDescription>
                </div>
              </button>
            </CollapsibleTrigger>
            <Button size="sm" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-1" />
              {T("ep.addPrice")}
            </Button>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              {loading ? (
                <Skeleton className="h-24" />
              ) : prices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {T("ep.noprices")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{T("ep.carrier")}</TableHead>
                      <TableHead>{T("ep.meter")}</TableHead>
                      <TableHead>{T("ep.price")}</TableHead>
                      <TableHead>{T("ep.validFrom")}</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prices.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {T(ENERGY_TYPE_KEYS[p.energy_type] || `ep.${p.energy_type}`)}
                            {p.is_dynamic && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5"><Zap className="h-2.5 w-2.5" />{T("ep.dynamic")}</Badge>}
                            {p.direction === "feed_in" && <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 text-green-600 border-green-300"><ArrowUpFromLine className="h-2.5 w-2.5" />{T("ep.feedIn")}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {p.meter_id ? (
                            <Badge variant="outline" className="font-normal text-xs">
                              {getMeterName(p.meter_id)}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">{T("ep.allMeters")}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {p.is_dynamic ? (
                            <span className="text-sm">
                              Spot + {Number(p.spot_markup_per_unit).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/{p.unit}
                              {currentSpotPrice && (
                                <span className="text-muted-foreground ml-1">
                                  ({T("ep.currently")} {((currentSpotPrice.price_eur_mwh / 1000) + Number(p.spot_markup_per_unit)).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/{p.unit})
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
            <DialogTitle>{editingPrice ? T("ep.editTitle") : T("ep.addTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{T("ep.carrier")}</Label>
              <Select value={formData.energy_type} onValueChange={(v) => setFormData({ ...formData, energy_type: v, is_dynamic: v !== "strom" ? false : formData.is_dynamic, meter_id: "" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ENERGY_TYPE_KEYS).map(([key, tKey]) => (
                    <SelectItem key={key} value={key}>{T(tKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Meter assignment */}
            <div>
              <Label>{T("ep.meterAssignment")}</Label>
              <Select value={formData.meter_id || "_all"} onValueChange={(v) => setFormData({ ...formData, meter_id: v === "_all" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">{T("ep.allMeters")}</SelectItem>
                  {metersForEnergyType.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}{m.meter_number ? ` (${m.meter_number})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{T("ep.meterAssignmentDesc")}</p>
            </div>

            {formData.energy_type === "strom" && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-1.5"><Zap className="h-4 w-4" />{T("ep.dynamicLabel")}</Label>
                  <p className="text-xs text-muted-foreground">{T("ep.dynamicDesc")}</p>
                </div>
                <Switch checked={formData.is_dynamic} onCheckedChange={(checked) => setFormData({ ...formData, is_dynamic: checked })} />
              </div>
            )}
            {formData.is_dynamic && formData.energy_type === "strom" ? (
              <div>
                <Label>{T("ep.markupLabel")}</Label>
                <Input
                  type="text"
                  placeholder="0,12"
                  value={formData.spot_markup_per_unit}
                  onChange={(e) => setFormData({ ...formData, spot_markup_per_unit: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {T("ep.markupDesc")}
                </p>
              </div>
            ) : (
              <div>
                <Label>{T("ep.pricePerUnit").replace("{unit}", ENERGY_TYPE_UNITS[formData.energy_type])}</Label>
                <Input
                  type="text"
                  placeholder="0,30"
                  value={formData.price_per_unit}
                  onChange={(e) => setFormData({ ...formData, price_per_unit: e.target.value })}
                />
              </div>
            )}
            <div>
              <Label>{T("ep.validFrom")}</Label>
              <Input
                type="date"
                value={formData.valid_from}
                onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{T("common.cancel")}</Button>
            <Button onClick={handleSave}>{T("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
