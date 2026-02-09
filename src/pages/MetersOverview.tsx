import { useState } from "react";
import { MeterQrCode } from "@/components/integrations/MeterQrCode";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLocations } from "@/hooks/useLocations";
import { useMeters, Meter } from "@/hooks/useMeters";
import { useMeterReadings } from "@/hooks/useMeterReadings";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { AddMeterReadingDialog } from "@/components/meters/AddMeterReadingDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Gauge, ClipboardEdit, Filter, QrCode } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const ENERGY_TYPE_LABELS: Record<string, string> = {
  strom: "Strom",
  gas: "Gas",
  waerme: "Wärme",
  wasser: "Wasser",
};

const MetersOverview = () => {
  const { user, loading: authLoading } = useAuth();
  const { locations, loading: locationsLoading } = useLocations();
  const { meters, loading: metersLoading } = useMeters();
  const { readings, loading: readingsLoading, addReading, getLastReading } = useMeterReadings();

  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [readingDialogMeter, setReadingDialogMeter] = useState<Meter | null>(null);
  const [qrMeter, setQrMeter] = useState<Meter | null>(null);

  if (authLoading || locationsLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto p-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <Skeleton className="h-96" />
        </main>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const filteredMeters = meters.filter((m) =>
    selectedLocationId === "all" ? true : m.location_id === selectedLocationId
  );

  const getLocationName = (locationId: string) =>
    locations.find((l) => l.id === locationId)?.name || "–";

  const getLastReadingForMeter = (meterId: string) => {
    const meterReadings = readings
      .filter((r) => r.meter_id === meterId)
      .sort((a, b) => b.reading_date.localeCompare(a.reading_date));
    return meterReadings[0] ?? null;
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Gauge className="h-6 w-6 text-primary" />
            Messstellen
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Übersicht aller Zähler und manuelle Zählerstanderfassung
          </p>
        </header>

        <div className="p-6 space-y-6">
          {/* Filter */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Liegenschaft filtern
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger className="max-w-sm">
                  <SelectValue placeholder="Standort wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Liegenschaften</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Meters Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Zähler ({filteredMeters.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {metersLoading || readingsLoading ? (
                <Skeleton className="h-32" />
              ) : filteredMeters.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  Keine Messstellen gefunden.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Liegenschaft</TableHead>
                      <TableHead>Zählernummer</TableHead>
                      <TableHead>Energieart</TableHead>
                      <TableHead>Erfassung</TableHead>
                      <TableHead>Letzter Stand</TableHead>
                      <TableHead className="w-48" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMeters.map((m) => {
                      const lastReading = getLastReadingForMeter(m.id);
                      const isManual = m.capture_type === "manual";
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">{m.name}</TableCell>
                          <TableCell>{getLocationName(m.location_id)}</TableCell>
                          <TableCell>{m.meter_number || "–"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {ENERGY_TYPE_LABELS[m.energy_type] || m.energy_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={isManual ? "secondary" : "default"}>
                              {isManual ? "Manuell" : "Automatisch"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {lastReading ? (
                              <span className="text-sm">
                                {lastReading.value.toLocaleString("de-DE")} {m.unit}
                                <span className="text-muted-foreground ml-1 text-xs">
                                  ({format(new Date(lastReading.reading_date), "dd.MM.yy", { locale: de })})
                                </span>
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">–</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {isManual && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setReadingDialogMeter(m)}
                                >
                                  <ClipboardEdit className="h-4 w-4 mr-1" />
                                  Ablesen
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setQrMeter(m)}
                                title="QR-Code generieren"
                              >
                                <QrCode className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Reading dialog */}
        {readingDialogMeter && (
          <AddMeterReadingDialog
            open={!!readingDialogMeter}
            onOpenChange={(open) => {
              if (!open) setReadingDialogMeter(null);
            }}
            meterName={`${readingDialogMeter.name}${readingDialogMeter.meter_number ? ` (${readingDialogMeter.meter_number})` : ""}`}
            meterUnit={readingDialogMeter.unit}
            lastReading={getLastReadingForMeter(readingDialogMeter.id)}
            onSubmit={async (data) => {
              return await addReading({
                meter_id: readingDialogMeter.id,
                ...data,
              });
            }}
          />
        )}

        {/* Meter QR Code Dialog */}
        {qrMeter && (
          <MeterQrCode
            meter={qrMeter}
            open={!!qrMeter}
            onOpenChange={(open) => !open && setQrMeter(null)}
          />
        )}
      </main>
    </div>
  );
};

export default MetersOverview;
