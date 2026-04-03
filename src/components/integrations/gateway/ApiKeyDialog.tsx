import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Key, Copy, Check, ShieldCheck, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { GatewayDevice } from "@/hooks/useGatewayDevices";

/** Generate a cryptographically secure API key */
function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `gw_${hex}`;
}

/** SHA-256 hash a string (matches gateway-ingest server-side logic) */
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface ApiKeyDialogProps {
  device: GatewayDevice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeyGenerated: () => void;
}

export function ApiKeyDialog({ device, open, onOpenChange, onKeyGenerated }: ApiKeyDialogProps) {
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleGenerate = async () => {
    setSaving(true);
    try {
      const newKey = generateApiKey();
      const keyHash = await hashApiKey(newKey);

      const { error } = await supabase
        .from("gateway_devices")
        .update({ api_key_hash: keyHash } as any)
        .eq("id", device.id);

      if (error) throw error;

      setGeneratedKey(newKey);
      onKeyGenerated();
      toast.success("API-Key wurde generiert");
    } catch (err) {
      toast.error("Fehler beim Generieren des API-Keys");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedKey) return;
    await navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    toast.success("API-Key kopiert");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setGeneratedKey(null);
      setCopied(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Device API-Key: {device.device_name}
          </DialogTitle>
          <DialogDescription>
            {generatedKey
              ? "Der API-Key wird nur einmal angezeigt. Kopiere ihn jetzt und trage ihn in der Add-on-Konfiguration ein."
              : "Generiere einen eigenen API-Key für dieses Gateway-Gerät. Der Key ersetzt den globalen Gateway-Key und bietet bessere Sicherheit im Multi-Tenant-Betrieb."
            }
          </DialogDescription>
        </DialogHeader>

        {generatedKey ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input value={generatedKey} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
              <p className="font-medium">⚠️ Wichtig</p>
              <p className="mt-1">
                Dieser Key wird nur jetzt angezeigt. Kopiere ihn und trage ihn als{" "}
                <code className="bg-muted px-1 rounded">gateway_api_key</code> in der Add-on-Konfiguration ein.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {device.api_key_hash ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                <span>Dieses Gerät hat bereits einen eigenen API-Key. Ein neuer Key ersetzt den bestehenden.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldAlert className="h-4 w-4" />
                <span>Dieses Gerät nutzt aktuell den globalen Gateway-Key.</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {generatedKey ? (
            <Button onClick={() => handleClose(false)}>Schließen</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Abbrechen</Button>
              <Button onClick={handleGenerate} disabled={saving}>
                {saving ? "Wird generiert..." : device.api_key_hash ? "Neuen Key generieren" : "Key generieren"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
