import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMeters, Meter } from "@/hooks/useMeters";
import { useLocations } from "@/hooks/useLocations";
import { useMeterReadings } from "@/hooks/useMeterReadings";
import { useOfflineReadings } from "@/hooks/useOfflineReadings";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Camera,
  QrCode,
  Keyboard,
  Zap,
  LogOut,
  Loader2,
  Check,
  AlertTriangle,
  X,
  ImageIcon,
  WifiOff,
  RefreshCw,
  CloudUpload,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// --- Login Screen ---
function MobileLogin({ onLogin }: { onLogin: () => void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error(error.message.includes("Invalid login") ? "Ungültige Zugangsdaten" : error.message);
    } else {
      onLogin();
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6" style={{ paddingTop: "env(safe-area-inset-top, 20px)" }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="h-14 w-14 rounded-xl bg-primary flex items-center justify-center mx-auto mb-3">
            <Zap className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Smart Energy Hub</h1>
          <p className="text-sm text-muted-foreground mt-1">Zählerstand erfassen</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-Mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="h-12 text-base" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Passwort</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className="h-12 text-base" />
          </div>
          <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Anmelden"}
          </Button>
        </form>
      </div>
    </div>
  );
}

// --- Unknown Meter Prompt ---
interface UnknownMeterPromptProps {
  meterNumber: string;
  reading: string;
  onReadingChange: (v: string) => void;
  capturedImage: string | null;
  locations: { id: string; name: string }[];
  onCreateMeter: (locationId: string, energyType: string, installationDate?: string, meterOperator?: string) => void;
  onDismiss: () => void;
  creating: boolean;
}

const ENERGY_TYPE_OPTIONS = [
  { value: "strom", label: "Strom", unit: "kWh" },
  { value: "gas", label: "Gas", unit: "m³" },
  { value: "wasser", label: "Wasser", unit: "m³" },
  { value: "waerme", label: "Wärme", unit: "kWh" },
];

function UnknownMeterPrompt({ meterNumber, reading, onReadingChange, capturedImage, locations, onCreateMeter, onDismiss, creating }: UnknownMeterPromptProps) {
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedEnergyType, setSelectedEnergyType] = useState("strom");
  const [installationDate, setInstallationDate] = useState("");
  const [meterOperator, setMeterOperator] = useState("");
  const allFilled = !!selectedLocationId && !!reading;

  return (
    <Card className="border-destructive/40 bg-muted">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Zähler nicht gefunden</p>
            <p className="text-xs text-muted-foreground">
              Die erkannte Zählernummer <span className="font-mono font-semibold">{meterNumber}</span> ist im System nicht hinterlegt.
            </p>
            {reading && (
              <p className="text-xs text-muted-foreground">
                Erkannter Zählerstand: <span className="font-mono font-semibold">{reading}</span>
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3 border-t pt-3">
          <p className="text-sm font-medium">Zähler jetzt anlegen?</p>
          <div className="space-y-2">
            <Label>Zählerstand</Label>
            <Input
              type="number"
              step="any"
              value={reading}
              onChange={(e) => onReadingChange(e.target.value)}
              className="h-12 text-lg font-mono"
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label>Messstelle zuordnen</Label>
            <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Messstelle wählen" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Energieart</Label>
            <Select value={selectedEnergyType} onValueChange={setSelectedEnergyType}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Energieart wählen" />
              </SelectTrigger>
              <SelectContent>
                {ENERGY_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {capturedImage && (
            <div className="rounded-lg overflow-hidden border">
              <img src={capturedImage} alt="Zählerfoto" className="w-full h-32 object-cover" />
              <p className="text-xs text-muted-foreground p-2">Foto wird dem Zähler zugeordnet</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Installationsdatum</Label>
            <Input type="date" value={installationDate} onChange={(e) => setInstallationDate(e.target.value)} className="h-12 text-base" />
          </div>
          <div className="space-y-2">
            <Label>Messstellenbetreiber</Label>
            <Input value={meterOperator} onChange={(e) => setMeterOperator(e.target.value)} placeholder="z.B. Netzbetreiber GmbH" className="h-12 text-base" />
          </div>

          <div className="flex gap-3">
            <Button
              variant="destructive"
              className="flex-1 h-12"
              onClick={onDismiss}
              disabled={creating}
            >
              Abbrechen
            </Button>
            <Button
              className={`flex-1 h-12 ${allFilled ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
              onClick={() => onCreateMeter(selectedLocationId, selectedEnergyType, installationDate || undefined, meterOperator || undefined)}
              disabled={!allFilled || creating}
            >
              {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                <>
                  <Check className="h-5 w-5 mr-1" />
                  Anlegen
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Reading Confirmation ---
interface ReadingConfirmProps {
  meter: Meter | null;
  meters: Meter[];
  reading: string;
  readingDate: string;
  onReadingChange: (v: string) => void;
  onDateChange: (v: string) => void;
  onMeterChange: (id: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  lastReading: { value: number; reading_date: string } | null;
  confidence?: string;
}

function ReadingConfirmation({
  meter, meters, reading, readingDate, onReadingChange, onDateChange, onMeterChange, onSubmit, onCancel, submitting, lastReading, confidence,
}: ReadingConfirmProps) {
  const readingNum = parseFloat(reading);
  const plausibilityWarning = lastReading && !isNaN(readingNum) && readingNum < lastReading.value;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Zählerstand bestätigen
            {confidence && (
              <Badge variant={confidence === "high" ? "default" : confidence === "medium" ? "secondary" : "destructive"}>
                {confidence === "high" ? "Sicher" : confidence === "medium" ? "Mittel" : "Unsicher"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Zähler</Label>
            <Select value={meter?.id || ""} onValueChange={onMeterChange}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Zähler wählen" />
              </SelectTrigger>
              <SelectContent>
                {meters.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} {m.meter_number ? `(${m.meter_number})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Zählerstand</Label>
            <Input
              type="number"
              step="any"
              value={reading}
              onChange={(e) => onReadingChange(e.target.value)}
              className="h-12 text-lg font-mono"
              placeholder="0"
            />
            {lastReading && (
              <p className="text-xs text-muted-foreground">
                Letzter Stand: {lastReading.value.toLocaleString("de-DE")} ({format(new Date(lastReading.reading_date), "dd.MM.yyyy")})
              </p>
            )}
            {plausibilityWarning && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-muted p-2 rounded">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Der neue Stand ist niedriger als der letzte Stand!
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Ablesedatum</Label>
            <Input type="date" value={readingDate} onChange={(e) => onDateChange(e.target.value)} className="h-12 text-base" />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 h-12" onClick={onCancel}>
              Abbrechen
            </Button>
            <Button variant="secondary" className="flex-1 h-12" onClick={onSubmit} disabled={submitting || !reading || !meter}>
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                <>
                  <Check className="h-5 w-5 mr-1" />
                  Speichern
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Main Mobile App ---
const MobileApp = () => {
  const { user, loading: authLoading, signOut } = useAuth();

  // Set PWA manifest & Apple meta for this app
  useEffect(() => {
    let link = document.querySelector("link[rel='manifest']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = "/manifest.json";

    const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (meta) meta.setAttribute("content", "Meter Mate");
  }, []);
  const { meters, loading: metersLoading, addMeter, refetch: refetchMeters } = useMeters();
  const { locations, loading: locationsLoading } = useLocations();
  const { addReading, getLastReading } = useMeterReadings();
  const { pending, pendingCount, isOnline, syncing, enqueue, syncAll } = useOfflineReadings();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("camera");
  const [loggedIn, setLoggedIn] = useState(false);

  // Confirmation state
  const [selectedMeterId, setSelectedMeterId] = useState<string>("");
  const [reading, setReading] = useState("");
  const [readingDate, setReadingDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confidence, setConfidence] = useState<string | undefined>();

  // Unknown meter state
  const [unknownMeterNumber, setUnknownMeterNumber] = useState<string | null>(null);
  const [creatingMeter, setCreatingMeter] = useState(false);

  // Camera/AI state
  const [processing, setProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // QR scanner state
  const [qrScanning, setQrScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const selectedMeter = meters.find((m) => m.id === selectedMeterId) || null;
  const lastReading = selectedMeterId ? getLastReading(selectedMeterId) : null;

  // Lock orientation to portrait
  useEffect(() => {
    try {
      (screen.orientation as any)?.lock?.("portrait").catch(() => {});
    } catch {}
  }, []);

  const handleSubmitReading = async () => {
    if (!selectedMeterId || !reading) return;
    setSubmitting(true);
    const captureMethod = activeTab === "camera" ? "ai" : activeTab === "qr" ? "qr" : "manual";

    if (!isOnline) {
      // Offline: queue locally
      enqueue({
        meter_id: selectedMeterId,
        value: parseFloat(reading),
        reading_date: readingDate,
        capture_method: captureMethod,
      });
      setSubmitting(false);
      toast.success("Zählerstand offline gespeichert – wird bei Verbindung übermittelt");
      resetState();
      return;
    }

    const success = await addReading({
      meter_id: selectedMeterId,
      value: parseFloat(reading),
      reading_date: readingDate,
      capture_method: captureMethod,
    });
    setSubmitting(false);
    if (success) {
      toast.success("Zählerstand gespeichert!");
      resetState();
    }
  };

  const resetState = () => {
    setShowConfirm(false);
    setReading("");
    setReadingDate(format(new Date(), "yyyy-MM-dd"));
    setSelectedMeterId("");
    setCapturedImage(null);
    setConfidence(undefined);
    setUnknownMeterNumber(null);
  };

  // --- Create unknown meter ---
  const handleCreateUnknownMeter = async (locationId: string, energyType: string = "strom", installationDate?: string, meterOperator?: string) => {
    if (!unknownMeterNumber || !locationId) return;
    const selectedUnit = ENERGY_TYPE_OPTIONS.find(o => o.value === energyType)?.unit || "kWh";
    setCreatingMeter(true);
    try {
      // Upload photo if available
      let photoUrl: string | undefined;
      if (capturedImage) {
        const fileName = `${Date.now()}-${unknownMeterNumber.replace(/\s/g, "_")}.jpg`;
        const base64Data = capturedImage.split(",")[1];
        const byteArray = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("meter-photos")
          .upload(fileName, byteArray, { contentType: "image/jpeg" });
        if (!uploadError && uploadData) {
          const { data: urlData } = supabase.storage.from("meter-photos").getPublicUrl(uploadData.path);
          photoUrl = urlData.publicUrl;
        }
      }

      // Create meter
      const meterName = `Zähler ${unknownMeterNumber}`;
      await addMeter({
        name: meterName,
        location_id: locationId,
        meter_number: unknownMeterNumber,
        energy_type: energyType,
        unit: selectedUnit,
        capture_type: "manual",
        photo_url: photoUrl,
        installation_date: installationDate,
        meter_operator: meterOperator,
      });

      // Refetch meters, then find the new meter and save the reading
      await refetchMeters();

      // Small delay to ensure state update
      const { data: newMeters } = await supabase
        .from("meters")
        .select("id")
        .eq("meter_number", unknownMeterNumber)
        .limit(1);

      if (newMeters?.[0] && reading) {
        await addReading({
          meter_id: newMeters[0].id,
          value: parseFloat(reading),
          reading_date: readingDate,
          capture_method: "ai",
        });
        toast.success("Zähler angelegt und Zählerstand gespeichert!");
      } else {
        toast.success("Zähler angelegt!");
      }
      resetState();
    } catch (err) {
      toast.error("Fehler beim Anlegen des Zählers");
    }
    setCreatingMeter(false);
  };


  const processImage = async (imageData: string) => {
    setProcessing(true);
    setCapturedImage(imageData);
    try {
      const { data, error } = await supabase.functions.invoke("meter-ocr", {
        body: { image: imageData },
      });

      if (error) {
        toast.error("KI-Erkennung fehlgeschlagen");
        setProcessing(false);
        return;
      }

      if (data.error) {
        toast.error(data.error);
        setProcessing(false);
        return;
      }

      // Set recognized reading
      if (data.reading !== undefined) {
        setReading(String(data.reading));
      }
      setConfidence(data.confidence);

      // Try to match meter by number
      let meterMatched = false;
      if (data.meter_number) {
        const matched = meters.find(
          (m) => m.meter_number && m.meter_number.replace(/\s/g, "") === data.meter_number.replace(/\s/g, "")
        );
        if (matched) {
          setSelectedMeterId(matched.id);
          toast.success(`Zähler erkannt: ${matched.name}`);
          meterMatched = true;
        } else {
          // Meter number detected but not found in system
          setUnknownMeterNumber(data.meter_number);
          setProcessing(false);
          return;
        }
      }

      setShowConfirm(true);
    } catch (err) {
      toast.error("Fehler bei der Bilderkennung");
    }
    setProcessing(false);
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        processImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // --- QR Scanner ---
  const stopQrScan = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setQrScanning(false);
  }, []);

  const scanQrFrameRef = useRef<() => void>(() => {});

  // Keep scanQrFrame logic in a ref to avoid stale closures
  useEffect(() => {
    scanQrFrameRef.current = () => {
      if (!videoRef.current || !streamRef.current) return;

      const video = videoRef.current;
      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        requestAnimationFrame(() => scanQrFrameRef.current());
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);

      if ("BarcodeDetector" in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        detector.detect(canvas).then((barcodes: any[]) => {
          if (barcodes.length > 0) {
            handleQrResult(barcodes[0].rawValue);
            return;
          }
          if (streamRef.current) requestAnimationFrame(() => scanQrFrameRef.current());
        }).catch(() => {
          if (streamRef.current) requestAnimationFrame(() => scanQrFrameRef.current());
        });
      } else {
        // Fallback for Safari/iOS using jsQR
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        import("jsqr").then(({ default: jsQR }) => {
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code) {
            handleQrResult(code.data);
            return;
          }
          if (streamRef.current) requestAnimationFrame(() => scanQrFrameRef.current());
        }).catch(() => {
          if (streamRef.current) requestAnimationFrame(() => scanQrFrameRef.current());
        });
      }
    };
  });

  const startQrScan = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setQrScanning(true);
    } catch (err) {
      toast.error("Kamera konnte nicht geöffnet werden");
    }
  };

  // Callback ref to attach stream immediately when video element mounts
  const videoCallbackRef = useCallback((node: HTMLVideoElement | null) => {
    (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.setAttribute("autoplay", "true");
      node.play().then(() => {
        scanQrFrameRef.current();
      }).catch(() => {
        toast.error("Video konnte nicht gestartet werden");
      });
    }
  }, []);

  const handleQrResult = (rawValue: string) => {
    stopQrScan();
    try {
      const parsed = JSON.parse(rawValue);
      if (parsed.type === "meter" && parsed.id) {
        const matched = meters.find((m) => m.id === parsed.id);
        if (matched) {
          setSelectedMeterId(matched.id);
          toast.success(`Zähler erkannt: ${matched.name}`);
          setShowConfirm(true);
          return;
        }
      }
    } catch {
      const matched = meters.find(
        (m) => m.meter_number && m.meter_number.replace(/\s/g, "") === rawValue.replace(/\s/g, "")
      );
      if (matched) {
        setSelectedMeterId(matched.id);
        toast.success(`Zähler erkannt: ${matched.name}`);
        setShowConfirm(true);
        return;
      }
    }
    toast.error("Zähler nicht gefunden");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // --- Auth check ---
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" style={{ paddingTop: "env(safe-area-inset-top, 20px)" }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <MobileLogin onLogin={() => setLoggedIn(true)} />;
  }

  if (metersLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" style={{ paddingTop: "env(safe-area-inset-top, 20px)" }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col" style={{ paddingTop: "env(safe-area-inset-top, 20px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm">Zählerablesung</span>
          {!isOnline && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <WifiOff className="h-3 w-3" /> Offline
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {pendingCount > 0 && isOnline && (
            <Button variant="ghost" size="icon" onClick={syncAll} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-5 w-5" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Pending readings banner */}
      {pendingCount > 0 && (
        <div className="bg-muted px-4 py-2 flex items-center justify-between text-xs border-b">
          <span className="text-muted-foreground">
            {pendingCount} Ablesung{pendingCount > 1 ? "en" : ""} ausstehend
          </span>
          {isOnline && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={syncAll} disabled={syncing}>
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Jetzt senden
            </Button>
          )}
        </div>
      )}

      {/* Content */}
      <main className="flex-1 p-4">
        {/* Unknown meter prompt */}
        {unknownMeterNumber && !showConfirm ? (
          <UnknownMeterPrompt
            meterNumber={unknownMeterNumber}
            reading={reading}
            onReadingChange={setReading}
            capturedImage={capturedImage}
            locations={locations.map((l) => ({ id: l.id, name: l.name }))}
            onCreateMeter={handleCreateUnknownMeter}
            onDismiss={resetState}
            creating={creatingMeter}
          />
        ) : showConfirm ? (
          <ReadingConfirmation
            meter={selectedMeter}
            meters={meters}
            reading={reading}
            readingDate={readingDate}
            onReadingChange={setReading}
            onDateChange={setReadingDate}
            onMeterChange={setSelectedMeterId}
            onSubmit={handleSubmitReading}
            onCancel={resetState}
            submitting={submitting}
            lastReading={lastReading}
            confidence={confidence}
          />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-12">
              <TabsTrigger value="camera" className="gap-1.5 text-xs">
                <Camera className="h-4 w-4" />
                KI-Foto
              </TabsTrigger>
              <TabsTrigger value="qr" className="gap-1.5 text-xs">
                <QrCode className="h-4 w-4" />
                QR-Code
              </TabsTrigger>
              <TabsTrigger value="manual" className="gap-1.5 text-xs">
                <Keyboard className="h-4 w-4" />
                Manuell
              </TabsTrigger>
            </TabsList>

            {/* AI Camera Tab */}
            <TabsContent value="camera" className="mt-4 space-y-4">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Fotografieren Sie den Zähler. Die KI erkennt Zählerstand und Zählernummer automatisch.
                  </p>
                  {processing ? (
                    <div className="flex flex-col items-center gap-3 py-8">
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">KI analysiert das Bild...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <Button variant="secondary" className="h-14 text-base gap-2" onClick={() => cameraInputRef.current?.click()}>
                        <Camera className="h-5 w-5" />
                        Foto aufnehmen
                      </Button>
                      <Button variant="outline" className="h-14 text-base gap-2" onClick={() => fileInputRef.current?.click()}>
                        <ImageIcon className="h-5 w-5" />
                        Aus Galerie wählen
                      </Button>
                    </div>
                  )}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleCameraCapture}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleCameraCapture}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* QR Code Tab */}
            <TabsContent value="qr" className="mt-4 space-y-4">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Scannen Sie den QR-Code am Zähler, um ihn automatisch zu erkennen.
                  </p>
                  {qrScanning ? (
                    <div className="relative">
                      <video
                        ref={videoCallbackRef}
                        className="w-full aspect-square object-cover rounded-lg bg-black"
                        playsInline
                        muted
                        autoPlay
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-48 h-48 border-2 border-primary rounded-lg" />
                      </div>
                      <Button
                        variant="destructive"
                        className="absolute bottom-3 left-1/2 -translate-x-1/2 gap-1"
                        onClick={stopQrScan}
                      >
                        <X className="h-4 w-4" /> Stoppen
                      </Button>
                    </div>
                  ) : (
                    <Button variant="secondary" className="h-14 w-full text-base gap-2" onClick={startQrScan}>
                      <QrCode className="h-5 w-5" />
                      QR-Code scannen
                    </Button>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Manual Tab */}
            <TabsContent value="manual" className="mt-4 space-y-4">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Wählen Sie den Zähler und geben Sie den Stand manuell ein.
                  </p>
                  <div className="space-y-2">
                    <Label>Zähler</Label>
                    <Select value={selectedMeterId} onValueChange={setSelectedMeterId}>
                      <SelectTrigger className="h-12 text-base">
                        <SelectValue placeholder="Zähler wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {meters.filter((m) => m.capture_type === "manual" && !m.is_archived).map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name} {m.meter_number ? `(${m.meter_number})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedMeterId && (
                    <Button
                      variant="secondary"
                      className="h-14 w-full text-base"
                      onClick={() => setShowConfirm(true)}
                    >
                      Weiter zur Eingabe
                    </Button>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default MobileApp;
