import { useState, useRef } from "react";
import { ChargePoint } from "@/hooks/useChargePoints";
import { ChargingSession } from "@/hooks/useChargingSessions";
import { ChargerModel } from "@/hooks/useChargerModels";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, PlugZap, AlertTriangle, ZapOff, WifiOff, Camera, Trash2, Edit, Save, X, Clock, MapPin, Search, Shield, Info as InfoIcon } from "lucide-react";
import { format } from "date-fns";
import { fmtKwh, fmtKw } from "@/lib/formatCharging";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { AccessControlSettings } from "@/components/charging/AccessControlSettings";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Zap }> = {
  available: { label: "Verfügbar", variant: "default", icon: Zap },
  charging: { label: "Lädt", variant: "secondary", icon: PlugZap },
  faulted: { label: "Gestört", variant: "destructive", icon: AlertTriangle },
  unavailable: { label: "Nicht verfügbar", variant: "outline", icon: ZapOff },
  offline: { label: "Offline", variant: "outline", icon: WifiOff },
};

interface Props {
  chargePoint: ChargePoint | null;
  sessions: ChargingSession[];
  vendors: string[];
  getModelsForVendor: (vendor: string) => ChargerModel[];
  isAdmin: boolean;
  onClose: () => void;
  onUpdate: (data: Partial<ChargePoint> & { id: string }) => void;
  onDelete: (id: string) => void;
}

export default function ChargePointDetailDialog({
  chargePoint: cp,
  sessions,
  vendors,
  getModelsForVendor,
  isAdmin,
  onClose,
  onUpdate,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", ocpp_id: "", address: "", connector_count: "1", max_power_kw: "22", vendor: "", model: "" });
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    if (!cp) return;
    setForm({
      name: cp.name,
      ocpp_id: cp.ocpp_id,
      address: cp.address || "",
      connector_count: String(cp.connector_count),
      max_power_kw: String(cp.max_power_kw),
      vendor: cp.vendor || "",
      model: cp.model || "",
    });
    setCoords({ lat: cp.latitude, lng: cp.longitude });
    setPhotoUrl(cp.photo_url || null);
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = () => {
    if (!cp) return;
    onUpdate({
      id: cp.id,
      name: form.name,
      ocpp_id: form.ocpp_id,
      address: form.address || null,
      latitude: coords.lat,
      longitude: coords.lng,
      connector_count: parseInt(form.connector_count) || 1,
      max_power_kw: Math.max(0.1, parseFloat(form.max_power_kw) || 22),
      vendor: form.vendor || null,
      model: form.model || null,
      photo_url: photoUrl,
    } as any);
    setEditing(false);
  };

  const geocodeAddress = async () => {
    if (!form.address.trim()) return;
    setGeocoding(true);
    try {
      const query = encodeURIComponent(form.address);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
        { headers: { "Accept-Language": "de", "User-Agent": "SmartEnergyHub/1.0" } }
      );
      const data = await res.json();
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setCoords({ lat, lng });
        toast({ title: "Koordinaten ermittelt", description: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
      } else {
        toast({ title: "Adresse nicht gefunden", variant: "destructive" });
      }
    } catch {
      toast({ title: "Geocoding-Fehler", variant: "destructive" });
    } finally {
      setGeocoding(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cp) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `charge-points/${cp.id}.${ext}`;
    const { error } = await supabase.storage.from("meter-photos").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload fehlgeschlagen", description: error.message, variant: "destructive" });
    } else {
      const { data: signedData } = await supabase.storage.from("meter-photos").createSignedUrl(path, 60 * 60 * 24 * 365);
      setPhotoUrl(signedData?.signedUrl || null);
    }
    setUploading(false);
  };

  if (!cp) return null;

  const cfg = statusConfig[cp.status] || statusConfig.offline;
  const StatusIcon = cfg.icon;
  const cpSessions = sessions
    .filter((s) => s.charge_point_id === cp.id)
    .slice(0, 5);
  const currentPhoto = editing ? photoUrl : cp.photo_url;
  const isInGroup = !!cp.group_id;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">{cp.name}</DialogTitle>
            <Badge variant={cfg.variant} className="ml-2">
              <StatusIcon className="h-3 w-3 mr-1" />
              {cfg.label}
            </Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="details">
          <TabsList className="w-full">
            <TabsTrigger value="details" className="flex-1 text-xs">Details</TabsTrigger>
            <TabsTrigger value="access" className="flex-1 gap-1.5 text-xs"><Shield className="h-3.5 w-3.5" />Zugangssteuerung</TabsTrigger>
            <TabsTrigger value="sessions" className="flex-1 gap-1.5 text-xs"><Clock className="h-3.5 w-3.5" />Ladevorgänge</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4 space-y-4">
            {/* Photo */}
            <div className="relative w-full h-48 bg-muted rounded-lg overflow-hidden flex items-center justify-center">
              {currentPhoto ? (
                <img src={currentPhoto} alt={cp.name} className="object-cover w-full h-full" />
              ) : (
                <div className="text-muted-foreground flex flex-col items-center gap-2">
                  <Camera className="h-10 w-10" />
                  <span className="text-sm">Kein Foto vorhanden</span>
                </div>
              )}
              {editing && (
                <div className="absolute bottom-2 right-2 flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? "Lädt…" : "Foto hochladen"}
                  </Button>
                  {photoUrl && (
                    <Button size="sm" variant="destructive" onClick={() => setPhotoUrl(null)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </div>
              )}
            </div>

            {/* Details */}
            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div><Label>OCPP-ID</Label><Input value={form.ocpp_id} onChange={(e) => setForm({ ...form, ocpp_id: e.target.value })} /></div>
                </div>
                <div>
                  <Label>Adresse / Standort</Label>
                  <div className="flex gap-2">
                    <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="z.B. Musterstraße 1, 12345 Berlin" className="flex-1" />
                    <Button variant="outline" size="icon" onClick={geocodeAddress} disabled={geocoding || !form.address.trim()}>
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                  {coords.lat && coords.lng && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Anschlüsse</Label><Input type="number" min="1" value={form.connector_count} onChange={(e) => setForm({ ...form, connector_count: e.target.value })} /></div>
                  <div><Label>Max. Leistung (kW)</Label><Input type="number" min="0.1" step="0.1" value={form.max_power_kw} onChange={(e) => { const v = e.target.value; if (v === "" || parseFloat(v) >= 0) setForm({ ...form, max_power_kw: v }); }} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Hersteller</Label>
                    {vendors.length > 0 ? (
                      <Select value={form.vendor} onValueChange={(v) => setForm({ ...form, vendor: v, model: "" })}>
                        <SelectTrigger><SelectValue placeholder="Hersteller wählen" /></SelectTrigger>
                        <SelectContent>{vendors.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
                    )}
                  </div>
                  <div>
                    <Label>Modell</Label>
                    {form.vendor && getModelsForVendor(form.vendor).length > 0 ? (
                      <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
                        <SelectTrigger><SelectValue placeholder="Modell wählen" /></SelectTrigger>
                        <SelectContent>{getModelsForVendor(form.vendor).map((m) => <SelectItem key={m.id} value={m.model}>{m.model}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder={form.vendor ? "Kein hinterlegtes Modell" : "Erst Hersteller wählen"} />
                    )}
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={cancelEdit}><X className="h-4 w-4 mr-1" />Abbrechen</Button>
                  <Button onClick={saveEdit} disabled={!form.name || !form.ocpp_id}><Save className="h-4 w-4 mr-1" />Speichern</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-muted-foreground">OCPP-ID:</span> <span className="font-mono">{cp.ocpp_id}</span></div>
                  <div><span className="text-muted-foreground">Standort:</span> {cp.address || "—"}</div>
                  <div><span className="text-muted-foreground">Hersteller:</span> {cp.vendor || "—"}</div>
                  <div><span className="text-muted-foreground">Modell:</span> {cp.model || "—"}</div>
                  <div><span className="text-muted-foreground">Anschlüsse:</span> {cp.connector_count}</div>
                  <div><span className="text-muted-foreground">Max. Leistung:</span> {fmtKw(cp.max_power_kw)}</div>
                  <div><span className="text-muted-foreground">Firmware:</span> {cp.firmware_version || "—"}</div>
                  <div><span className="text-muted-foreground">Letzter Heartbeat:</span> {cp.last_heartbeat ? format(new Date(cp.last_heartbeat), "dd.MM.yyyy HH:mm") : "—"}</div>
                  {cp.latitude && cp.longitude && (
                    <div className="col-span-2 flex items-center gap-1 text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {cp.latitude.toFixed(5)}, {cp.longitude.toFixed(5)}
                    </div>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={startEdit}><Edit className="h-4 w-4 mr-1" />Bearbeiten</Button>
                    <Button variant="destructive" onClick={() => { onDelete(cp.id); onClose(); }}><Trash2 className="h-4 w-4 mr-1" />Löschen</Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Access Control Tab */}
          <TabsContent value="access" className="mt-4">
            {isInGroup ? (
              <div className="p-4 border rounded-lg bg-muted/30 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <InfoIcon className="h-4 w-4 text-muted-foreground" />
                  Dieser Ladepunkt ist einer Gruppe zugewiesen.
                </p>
                <p className="text-sm text-muted-foreground">
                  Die Zugangssteuerung wird über die Gruppeneinstellungen gesteuert. Individuelle Einstellungen sind deaktiviert.
                </p>
              </div>
            ) : (
              <AccessControlSettings
                entityType="chargepoint"
                entityId={cp.id}
                settings={cp.access_settings || { free_charging: false, user_group_restriction: false, max_charging_duration_min: 480 }}
                isAdmin={isAdmin}
                onSave={(s) => onUpdate({ id: cp.id, access_settings: s } as any)}
              />
            )}
          </TabsContent>

          {/* Sessions Tab */}
          <TabsContent value="sessions" className="mt-4">
            {cpSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Ladevorgänge vorhanden.</p>
            ) : (
              <div className="space-y-2">
                {cpSessions.map((s) => (
                  <Card key={s.id}>
                    <CardContent className="p-3 flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium">{format(new Date(s.start_time), "dd.MM.yyyy HH:mm")}</span>
                        {s.stop_time && (
                          <span className="text-muted-foreground"> – {format(new Date(s.stop_time), "HH:mm")}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span>{fmtKwh(s.energy_kwh)}</span>
                        <Badge variant={s.status === "active" ? "secondary" : "outline"} className="text-xs">
                          {s.status === "active" ? "Lädt" : "Beendet"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
