import { useState } from "react";
import { MeterQrCode } from "@/components/integrations/MeterQrCode";
import { EditMeterDialog } from "@/components/locations/EditMeterDialog";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLocations } from "@/hooks/useLocations";
import { useMeters, Meter } from "@/hooks/useMeters";
import { useMeterReadings } from "@/hooks/useMeterReadings";
import { useUserRole } from "@/hooks/useUserRole";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { AddMeterReadingDialog } from "@/components/meters/AddMeterReadingDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Gauge, ClipboardEdit, Filter, QrCode, Pencil, Archive, ArchiveRestore, Trash2, Eye, EyeOff } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { ENERGY_TYPE_LABELS, ENERGY_BADGE_CLASSES } from "@/lib/energyTypeColors";

const MetersOverview = () => {
  const { user, loading: authLoading } = useAuth();
  const { locations, loading: locationsLoading } = useLocations();
  const { meters, loading: metersLoading, updateMeter, archiveMeter, deleteMeter } = useMeters();
  const { readings, loading: readingsLoading, addReading } = useMeterReadings();
  const { isAdmin } = useUserRole();

  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [readingDialogMeter, setReadingDialogMeter] = useState<Meter | null>(null);
  const [qrMeter, setQrMeter] = useState<Meter | null>(null);
  const [editingMeter, setEditingMeter] = useState<Meter | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedEnergyType, setSelectedEnergyType] = useState<string>("all");
  const [selectedCaptureType, setSelectedCaptureType] = useState<string>("all");

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

  const locationFiltered = meters.filter((m) => {
    if (selectedLocationId !== "all" && m.location_id !== selectedLocationId) return false;
    if (selectedEnergyType !== "all" && m.energy_type !== selectedEnergyType) return false;
    if (selectedCaptureType !== "all" && m.capture_type !== selectedCaptureType) return false;
    return true;
  });

  const activeMeters = locationFiltered.filter((m) => !m.is_archived);
  const archivedMeters = locationFiltered.filter((m) => m.is_archived);
  const filteredMeters = showArchived ? archivedMeters : activeMeters;

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
              <div className="flex flex-wrap gap-4">
                <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                  <SelectTrigger className="w-[220px]">
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

                <Select value={selectedEnergyType} onValueChange={setSelectedEnergyType}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Energieart" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Energiearten</SelectItem>
                    <SelectItem value="strom">Strom</SelectItem>
                    <SelectItem value="gas">Gas</SelectItem>
                    <SelectItem value="waerme">Wärme</SelectItem>
                    <SelectItem value="wasser">Wasser</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={selectedCaptureType} onValueChange={setSelectedCaptureType}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Erfassung" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Erfassungen</SelectItem>
                    <SelectItem value="manual">Manuell</SelectItem>
                    <SelectItem value="automatic">Automatisch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Meters Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {showArchived ? "Archivierte Zähler" : "Zähler"} ({filteredMeters.length})
                </CardTitle>
                {archivedMeters.length > 0 && (
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setShowArchived(!showArchived)}>
                    {showArchived ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    {showArchived ? `Aktive anzeigen (${activeMeters.length})` : `Archiv (${archivedMeters.length})`}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {metersLoading || readingsLoading ? (
                <Skeleton className="h-32" />
              ) : filteredMeters.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  {showArchived ? "Keine archivierten Messstellen." : "Keine Messstellen gefunden."}
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
                      <TableHead className="w-56" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMeters.map((m) => {
                      const lastReading = getLastReadingForMeter(m.id);
                      const isManual = m.capture_type === "manual";
                      return (
                        <TableRow key={m.id} className={m.is_archived ? "opacity-60" : ""}>
                          <TableCell className="font-medium">{m.name}</TableCell>
                          <TableCell>{getLocationName(m.location_id)}</TableCell>
                          <TableCell>{m.meter_number || "–"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={ENERGY_BADGE_CLASSES[m.energy_type] || ""}>
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
                              {!m.is_archived && isManual && (
                                <Button size="sm" variant="outline" onClick={() => setReadingDialogMeter(m)}>
                                  <ClipboardEdit className="h-4 w-4 mr-1" />
                                  Ablesen
                                </Button>
                              )}
                              {!m.is_archived && (
                                <Button size="sm" variant="ghost" onClick={() => setQrMeter(m)} title="QR-Code">
                                  <QrCode className="h-4 w-4" />
                                </Button>
                              )}
                              {isAdmin && !m.is_archived && (
                                <Button size="sm" variant="ghost" onClick={() => setEditingMeter(m)} title="Bearbeiten">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {isAdmin && (
                                m.is_archived ? (
                                  <>
                                    <Button size="sm" variant="ghost" onClick={() => archiveMeter(m.id, false)} title="Wiederherstellen">
                                      <ArchiveRestore className="h-4 w-4 text-primary" />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => deleteMeter(m.id)} title="Endgültig löschen">
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button size="sm" variant="ghost" onClick={() => archiveMeter(m.id, true)} title="Archivieren">
                                    <Archive className="h-4 w-4" />
                                  </Button>
                                )
                              )}
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

        {/* Edit Meter Dialog */}
        {editingMeter && (
          <EditMeterDialog
            meter={editingMeter}
            open={!!editingMeter}
            onOpenChange={(open) => { if (!open) setEditingMeter(null); }}
            onSave={async (id, updates) => { await updateMeter(id, updates); }}
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
