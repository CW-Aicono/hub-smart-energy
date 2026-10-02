import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Lock, Unlock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import type { GatewayDevice } from "@/hooks/useGatewayDevices";

/** SHA-256 hash */
async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface PinConfigDialogProps {
  device: GatewayDevice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export function PinConfigDialog({ device, open, onOpenChange, onUpdated }: PinConfigDialogProps) {
  const existingConfig = (device.config || {}) as Record<string, unknown>;
  const hasPin = !!existingConfig.ui_pin_hash;

  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [pinEnabled, setPinEnabled] = useState<boolean>(hasPin);

  // Reset local state whenever the dialog opens for a (possibly different) device
  useEffect(() => {
    if (open) {
      setPin("");
      setPinEnabled(hasPin);
    }
  }, [open, hasPin]);

  const persistConfig = async (nextConfig: Record<string, unknown>) => {
    const { error } = await supabase
      .from("gateway_devices")
      .update({ config: nextConfig } as any)
      .eq("id", device.id);
    if (error) throw error;
  };

  const handleDisable = async () => {
    setSaving(true);
    try {
      const { ui_pin_hash: _omit, ...rest } = existingConfig as any;
      await persistConfig(rest);
      toast.success("PIN-Schutz wurde deaktiviert. Übernahme beim nächsten Heartbeat.");
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      toast.error("Fehler beim Deaktivieren des PIN-Schutzes");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    // Toggle off → simply remove the hash
    if (!pinEnabled) {
      await handleDisable();
      return;
    }

    if (pin.length < 4) {
      toast.error("PIN muss mindestens 4 Ziffern haben");
      return;
    }
    setSaving(true);
    try {
      const hash = await sha256(pin);
      await persistConfig({ ...existingConfig, ui_pin_hash: hash });
      toast.success("PIN wurde gesetzt. Er wird beim nächsten Heartbeat synchronisiert.");
      onUpdated();
      setPin("");
      onOpenChange(false);
    } catch (err) {
      toast.error("Fehler beim Speichern des PINs");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const saveDisabled =
    saving || (pinEnabled && pin.length < 4) || (!pinEnabled && !hasPin);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            UI-PIN: {device.device_name}
          </DialogTitle>
          <DialogDescription>
            Schütze die lokale Gateway-Oberfläche mit einem 4–6-stelligen PIN.
            Änderungen werden beim nächsten Heartbeat an das Gateway übertragen.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {/* Master switch – PIN protection on/off */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex flex-col">
              <Label htmlFor="pin-enabled" className="text-sm font-medium">
                PIN-Schutz aktivieren
              </Label>
              <span className="text-xs text-muted-foreground">
                {pinEnabled
                  ? "Lokale UI verlangt einen PIN."
                  : "Lokale UI ist ohne PIN erreichbar."}
              </span>
            </div>
            <Switch
              id="pin-enabled"
              checked={pinEnabled}
              onCheckedChange={setPinEnabled}
              disabled={saving}
            />
          </div>

          {pinEnabled ? (
            <div className="flex flex-col items-center gap-2">
              {hasPin && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <Lock className="h-4 w-4" />
                  <span>PIN-Schutz ist aktiv</span>
                </div>
              )}
              <span className="text-sm text-muted-foreground">
                {hasPin ? "Neuen PIN eingeben:" : "PIN festlegen:"}
              </span>
              <InputOTP maxLength={6} value={pin} onChange={setPin}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
              <span className="text-xs text-muted-foreground">4–6 Ziffern</span>
              {hasPin && (
                <span className="text-xs text-muted-foreground text-center">
                  Leer lassen und Schalter ausschalten, um den PIN-Schutz komplett zu entfernen.
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              <Unlock className="h-4 w-4 shrink-0" />
              <span>
                Beim Speichern wird ein eventuell hinterlegter PIN entfernt. Die lokale
                Oberfläche ist danach ohne PIN-Eingabe erreichbar.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={saveDisabled}>
            {saving ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Speichern…</>
            ) : pinEnabled ? (
              hasPin ? "PIN ändern" : "PIN setzen"
            ) : (
              "PIN-Schutz deaktivieren"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
