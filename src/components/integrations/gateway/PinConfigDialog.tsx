import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  const existingConfig = (device.config || {}) as Record<string, unknown>;
  const hasPin = !!existingConfig.ui_pin_hash;

  const handleSave = async () => {
    if (pin.length < 4) {
      toast.error("PIN muss mindestens 4 Ziffern haben");
      return;
    }
    setSaving(true);
    try {
      const hash = await sha256(pin);
      const newConfig = { ...existingConfig, ui_pin_hash: hash };

      const { error } = await supabase
        .from("gateway_devices")
        .update({ config: newConfig } as any)
        .eq("id", device.id);

      if (error) throw error;

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

  const handleRemove = async () => {
    setSaving(true);
    try {
      const { ui_pin_hash, ...rest } = existingConfig as any;
      const { error } = await supabase
        .from("gateway_devices")
        .update({ config: rest } as any)
        .eq("id", device.id);

      if (error) throw error;

      toast.success("PIN-Schutz wurde entfernt.");
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      toast.error("Fehler beim Entfernen des PINs");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

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
            Der PIN wird beim nächsten Heartbeat an das Gateway übertragen.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {hasPin && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <Lock className="h-4 w-4" />
              <span>PIN-Schutz ist aktiv</span>
            </div>
          )}

          <div className="flex flex-col items-center gap-2">
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
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {hasPin && (
            <Button variant="outline" onClick={handleRemove} disabled={saving} className="text-destructive">
              <Unlock className="h-4 w-4 mr-1" />
              PIN entfernen
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || pin.length < 4}>
            {saving ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Speichern…</>
            ) : (
              hasPin ? "PIN ändern" : "PIN setzen"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
