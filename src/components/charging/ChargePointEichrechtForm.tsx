import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  chargePointId: string;
}

export function ChargePointEichrechtForm({ chargePointId }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [format, setFormat] = useState<"OCMF" | "ALFEN" | "NONE">("NONE");
  const [publicKey, setPublicKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("charge_points")
        .select("eichrecht_enabled, meter_format, meter_public_key")
        .eq("id", chargePointId)
        .maybeSingle();
      if (!cancelled && data) {
        setEnabled(!!data.eichrecht_enabled);
        setFormat((data.meter_format as "OCMF" | "ALFEN" | "NONE") ?? "NONE");
        setPublicKey(data.meter_public_key ?? "");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chargePointId]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("charge_points")
      .update({
        eichrecht_enabled: enabled,
        meter_format: format,
        meter_public_key: publicKey || null,
      })
      .eq("id", chargePointId);
    setSaving(false);
    if (error) {
      toast.error(`Speichern fehlgeschlagen: ${error.message}`);
    } else {
      toast.success("Eichrecht-Konfiguration gespeichert");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Eichrecht (OCMF)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Wallbox ist eichrechtsfähig</Label>
            <p className="text-xs text-muted-foreground">
              Aktivieren Sie diese Option nur, wenn die Wallbox vom Hersteller eine PTB-Zulassung für DSAR/OCMF-Belege hat.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-2">
          <Label>Messwert-Format</Label>
          <Select value={format} onValueChange={(v) => setFormat(v as "OCMF" | "ALFEN" | "NONE")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Keines (unsignierter Stub)</SelectItem>
              <SelectItem value="OCMF">OCMF (S.A.F.E. Standard – z. B. ABL eMH3, Compleo)</SelectItem>
              <SelectItem value="ALFEN">ALFEN (Alfen-spezifisch, Base64-OCMF)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="meter-pk">Hersteller-Public-Key (PEM)</Label>
          <Textarea
            id="meter-pk"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder={"-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...\n-----END PUBLIC KEY-----"}
            rows={6}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Den Public-Key erhalten Sie vom Wallbox-Hersteller oder dem Ladekarten-Aufkleber an der Wallbox. Ohne Key kann die
            Signatur nicht geprüft werden – Belege werden dann als &quot;unsigned&quot; angezeigt.
          </p>
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? "Speichern …" : "Konfiguration speichern"}
        </Button>
      </CardContent>
    </Card>
  );
}
