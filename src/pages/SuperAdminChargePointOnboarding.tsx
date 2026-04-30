import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenants } from "@/hooks/useTenants";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import {
  Plug, ShieldCheck, ShieldOff, Lock, Unlock, Copy, CheckCircle2, AlertTriangle,
  ArrowLeft, ArrowRight, Loader2, Wifi, WifiOff, Sparkles,
} from "lucide-react";

type Protocol = "ws" | "wss";
const OCPP_DOMAIN = "ocpp.aicono.org";

function generatePassword(len = 32): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join("");
}
function generateOcppId(): string {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  return `AICONO-${hex.toUpperCase()}`;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm break-all">{value || "—"}</code>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          disabled={!value}
        >
          {copied ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export default function SuperAdminChargePointOnboarding() {
  const navigate = useNavigate();
  const { tenants } = useTenants();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [name, setName] = useState("");
  const [tenantId, setTenantId] = useState<string>("");
  const [vendor, setVendor] = useState("");
  const [model, setModel] = useState("");
  const [connectorCount, setConnectorCount] = useState(1);
  const [maxPowerKw, setMaxPowerKw] = useState(22);
  const [connectorType, setConnectorType] = useState("Type2");
  const [notes, setNotes] = useState("");

  // Step 2
  const [autoOcppId, setAutoOcppId] = useState(true);
  const [ocppId, setOcppId] = useState(generateOcppId());
  const [protocol, setProtocol] = useState<Protocol>("wss");
  const [authRequired, setAuthRequired] = useState(true);
  const [password, setPassword] = useState(generatePassword());
  const [certificateRequired, setCertificateRequired] = useState(false);
  const [certificateType, setCertificateType] = useState<string>("amazon-root-ca-1");

  // Step 3
  const [chargePointDbId, setChargePointDbId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);

  useEffect(() => {
    if (autoOcppId) setOcppId(generateOcppId());
  }, [autoOcppId]);

  // Realtime subscription on step 3
  useEffect(() => {
    if (step !== 3 || !chargePointDbId) return;
    const channel = supabase
      .channel(`onboarding-${chargePointDbId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "charge_points", filter: `id=eq.${chargePointDbId}` },
        (payload) => {
          const row = payload.new as { ws_connected?: boolean; last_heartbeat?: string | null };
          if (typeof row.ws_connected === "boolean") setWsConnected(row.ws_connected);
          if (row.last_heartbeat) setLastHeartbeat(row.last_heartbeat);
        }
      )
      .subscribe();
    // Initial fetch
    supabase
      .from("charge_points")
      .select("ws_connected, last_heartbeat")
      .eq("id", chargePointDbId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setWsConnected(!!data.ws_connected);
          setLastHeartbeat(data.last_heartbeat ?? null);
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [step, chargePointDbId]);

  const serverUrl = useMemo(() => {
    const port = protocol === "wss" ? "443" : "80";
    return { full: `${protocol}://${OCPP_DOMAIN}/${ocppId}`, port };
  }, [protocol, ocppId]);

  const canProceedFromStep1 = name.trim() && tenantId;
  const canProceedFromStep2 = ocppId.trim().length >= 3 && (!authRequired || password.length >= 8);

  async function createChargePoint() {
    if (!tenantId) return;
    setCreating(true);
    try {
      const payload = {
        tenant_id: tenantId,
        ocpp_id: ocppId.trim(),
        name: name.trim(),
        vendor: vendor.trim() || null,
        model: model.trim() || null,
        connector_count: connectorCount,
        max_power_kw: maxPowerKw,
        connector_type: connectorType,
        connection_protocol: protocol,
        auth_required: authRequired,
        ocpp_password: authRequired ? password : null,
        certificate_required: certificateRequired,
        certificate_type: certificateRequired ? certificateType : null,
        status: "available",
      };
      const { data, error } = await supabase
        .from("charge_points")
        .insert(payload as any)
        .select("id")
        .single();
      if (error) throw error;

      // Connectors automatisch anlegen
      const inserts = Array.from({ length: connectorCount }, (_, i) => ({
        charge_point_id: data.id,
        connector_id: i + 1,
        display_order: i,
        status: "unconfigured",
        connector_type: connectorType,
        max_power_kw: maxPowerKw,
      }));
      await supabase.from("charge_point_connectors").insert(inserts as any);

      setChargePointDbId(data.id);
      setStep(3);
      toast({ title: "Ladepunkt angelegt", description: "Übergeben Sie jetzt die Daten an den Installateur." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Fehler", description: msg, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="container mx-auto max-w-4xl p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-primary/10 grid place-items-center">
            <Plug className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ladepunkt anlegen</h1>
            <p className="text-sm text-muted-foreground">Geführter Onboarding-Assistent (Monta-Style)</p>
          </div>
        </div>
        <Button variant="ghost" onClick={() => navigate("/super-admin/ocpp/integrations")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Zurück
        </Button>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex-1 flex items-center gap-2">
            <div className={`h-8 w-8 rounded-full grid place-items-center text-sm font-medium ${
              step === n ? "bg-primary text-primary-foreground"
              : step > n ? "bg-primary/20 text-primary"
              : "bg-muted text-muted-foreground"
            }`}>
              {step > n ? <CheckCircle2 className="h-4 w-4" /> : n}
            </div>
            <div className="text-sm font-medium">
              {n === 1 ? "Stammdaten" : n === 2 ? "Verbindung" : "Verifikation"}
            </div>
            {n < 3 && <div className={`flex-1 h-px ${step > n ? "bg-primary/40" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Wallbox-Stammdaten</CardTitle>
            <CardDescription>Grunddaten zur Wallbox und Zuordnung zum Mandanten.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Bezeichnung *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Stellplatz 5" />
              </div>
              <div className="space-y-1.5">
                <Label>Mandant *</Label>
                <Select value={tenantId} onValueChange={setTenantId}>
                  <SelectTrigger><SelectValue placeholder="Mandant wählen…" /></SelectTrigger>
                  <SelectContent>
                    {tenants.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Hersteller</Label>
                <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="z. B. Compleo" />
              </div>
              <div className="space-y-1.5">
                <Label>Modell</Label>
                <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="z. B. eBox professional" />
              </div>
              <div className="space-y-1.5">
                <Label>Anzahl Connectoren</Label>
                <Input type="number" min={1} max={8} value={connectorCount}
                  onChange={(e) => setConnectorCount(Math.max(1, parseInt(e.target.value) || 1))} />
              </div>
              <div className="space-y-1.5">
                <Label>Max. Leistung (kW)</Label>
                <Input type="number" min={1} value={maxPowerKw}
                  onChange={(e) => setMaxPowerKw(parseFloat(e.target.value) || 22)} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Steckertyp</Label>
                <Select value={connectorType} onValueChange={setConnectorType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Type2">Type 2</SelectItem>
                    <SelectItem value="CCS">CCS</SelectItem>
                    <SelectItem value="CHAdeMO">CHAdeMO</SelectItem>
                    <SelectItem value="Schuko">Schuko</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Notizen (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep(2)} disabled={!canProceedFromStep1}>
                Weiter <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Verbindungs-Konfiguration</CardTitle>
            <CardDescription>OCPP-ID, Protokoll und Authentifizierung festlegen.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* OCPP-ID */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">OCPP-ID / ChargeBox ID</Label>
                <div className="flex items-center gap-2">
                  <Switch checked={autoOcppId} onCheckedChange={setAutoOcppId} id="auto-id" />
                  <Label htmlFor="auto-id" className="text-sm font-normal cursor-pointer">
                    Automatisch generieren
                  </Label>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  value={ocppId}
                  onChange={(e) => setOcppId(e.target.value)}
                  disabled={autoOcppId}
                  placeholder="z. B. WALLBOX-SN-12345 (Seriennummer der Wallbox)"
                  className="font-mono"
                />
                {autoOcppId && (
                  <Button type="button" variant="outline" onClick={() => setOcppId(generateOcppId())}>
                    <Sparkles className="h-4 w-4 mr-2" /> Neu
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Bei vielen Wallboxen (z. B. Compleo, ABL) wird die <strong>Seriennummer</strong> als ChargeBox-ID
                verwendet. Toggle dann ausschalten und Seriennummer eintragen.
              </p>
            </div>

            {/* Protocol */}
            <div className="space-y-3">
              <Label className="text-base">Verbindungs-Protokoll</Label>
              <RadioGroup value={protocol} onValueChange={(v) => setProtocol(v as Protocol)} className="grid md:grid-cols-2 gap-3">
                <label className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                  protocol === "wss" ? "border-primary bg-primary/5" : "border-border"
                }`}>
                  <RadioGroupItem value="wss" id="proto-wss" className="mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-medium"><Lock className="h-4 w-4" /> wss:// (verschlüsselt)</div>
                    <p className="text-xs text-muted-foreground">Empfohlen. Port 443. Nutzt TLS.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                  protocol === "ws" ? "border-primary bg-primary/5" : "border-border"
                }`}>
                  <RadioGroupItem value="ws" id="proto-ws" className="mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-medium"><Unlock className="h-4 w-4" /> ws:// (unverschlüsselt)</div>
                    <p className="text-xs text-muted-foreground">Port 80. Für ältere Wallboxen ohne TLS.</p>
                  </div>
                </label>
              </RadioGroup>
              {protocol === "ws" && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Unverschlüsselte Verbindung</AlertTitle>
                  <AlertDescription>
                    OCPP-Daten werden im Klartext übertragen. Nutzen Sie diese Option nur, wenn die Wallbox
                    kein TLS unterstützt (z. B. einige ältere Compleo- oder ABL-Modelle).
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Auth */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">Passwort-geschützte Verbindung</Label>
                <Switch checked={authRequired} onCheckedChange={setAuthRequired} />
              </div>
              {authRequired ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                    <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())}>
                      <Sparkles className="h-4 w-4 mr-2" /> Neu
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> Basic-Auth (RFC 7617). Wallbox sendet beim Connect.
                  </p>
                </div>
              ) : (
                <Alert>
                  <ShieldOff className="h-4 w-4" />
                  <AlertTitle>Verbindung ohne Authentifizierung</AlertTitle>
                  <AlertDescription>
                    Nur nutzen, wenn Ihre Wallbox keine Passwort-Eingabe unterstützt (z. B. einige go-e-
                    oder ältere KEBA-Modelle). Der Server akzeptiert dann den Connect ohne Authorization-Header.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Certificate */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">Zertifikats-Anforderung (optional)</Label>
                <Switch checked={certificateRequired} onCheckedChange={setCertificateRequired} />
              </div>
              {certificateRequired ? (
                <div className="space-y-2">
                  <Select value={certificateType} onValueChange={setCertificateType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amazon-root-ca-1">Amazon Root CA 1</SelectItem>
                      <SelectItem value="lets-encrypt-r3">Let's Encrypt R3</SelectItem>
                      <SelectItem value="custom">Eigenes Zertifikat (folgt)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Eigene Client-Zertifikate (mTLS) werden in einer kommenden Version unterstützt.
                      Aktuell wird nur die Auswahl gespeichert.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Falls Ihre Wallbox eine Server-Zertifikat-Auswahl verlangt: <strong>"Amazon Root CA 1"</strong> oder
                  <strong> "Let's Encrypt R3"</strong> wählen — beides funktioniert mit ocpp.aicono.org.
                </p>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Zurück
              </Button>
              <Button onClick={createChargePoint} disabled={!canProceedFromStep2 || creating}>
                {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Ladepunkt anlegen <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Installations-Daten
                <Badge variant="secondary">an Installateur übergeben</Badge>
              </CardTitle>
              <CardDescription>
                Diese Werte im Konfigurations-Interface der Wallbox eintragen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CopyField label="Server-URL" value={serverUrl.full} />
              <div className="grid md:grid-cols-2 gap-4">
                <CopyField label="ChargeBox ID" value={ocppId} />
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Port</Label>
                  <code className="block rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm">
                    {serverUrl.port} ({protocol.toUpperCase()})
                  </code>
                </div>
              </div>
              {authRequired ? (
                <CopyField label="Passwort (Basic Auth)" value={password} />
              ) : (
                <Alert>
                  <ShieldOff className="h-4 w-4" />
                  <AlertDescription>Diese Wallbox verbindet sich ohne Passwort.</AlertDescription>
                </Alert>
              )}
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>Server-Zertifikat (falls Wallbox danach fragt)</AlertTitle>
                <AlertDescription>
                  „Amazon Root CA 1" oder „Let's Encrypt R3" wählen — beides funktioniert.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card className={wsConnected ? "border-primary" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {wsConnected ? <Wifi className="h-5 w-5 text-primary" /> : <WifiOff className="h-5 w-5 text-muted-foreground" />}
                Live-Status
              </CardTitle>
              <CardDescription>
                Wir warten auf den ersten Connect der Wallbox an <code>{OCPP_DOMAIN}</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {wsConnected ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <AlertTitle>Verbunden!</AlertTitle>
                  <AlertDescription>
                    Die Wallbox hat erfolgreich eine WebSocket-Verbindung aufgebaut.
                    {lastHeartbeat && <> Letzter Heartbeat: {new Date(lastHeartbeat).toLocaleString()}</>}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <AlertTitle>Warte auf Verbindung…</AlertTitle>
                  <AlertDescription>
                    Sobald die Wallbox sich verbindet, wechselt der Status automatisch auf grün
                    (per Realtime, kein Reload nötig).
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => navigate("/super-admin/ocpp/integrations")}>
                  Zur Übersicht
                </Button>
                <Button onClick={() => {
                  setStep(1); setName(""); setVendor(""); setModel("");
                  setOcppId(generateOcppId()); setPassword(generatePassword());
                  setChargePointDbId(null); setWsConnected(false);
                }}>
                  Weiteren Ladepunkt anlegen
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
