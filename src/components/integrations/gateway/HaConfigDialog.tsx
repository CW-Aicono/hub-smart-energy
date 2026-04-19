import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Copy, Check, Info, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import type { GatewayDevice } from "@/hooks/useGatewayDevices";

interface HaConfigDialogProps {
  device: GatewayDevice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CopyRowProps {
  label: string;
  value: string | null | undefined;
  hint?: string;
  missingHint?: string;
}

function CopyRow({ label, value, hint, missingHint }: CopyRowProps) {
  const [copied, setCopied] = useState(false);
  const hasValue = !!value;

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} kopiert`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-mono text-muted-foreground">{label}</Label>
      {hasValue ? (
        <div className="flex gap-2">
          <Input
            readOnly
            value={value!}
            className="font-mono text-xs"
            onFocus={(e) => e.target.select()}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleCopy}
            title="Kopieren"
          >
            {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      ) : (
        <Alert className="py-2">
          <Info className="h-3.5 w-3.5" />
          <AlertDescription className="text-xs">
            {missingHint ?? "Nicht verfügbar."}
          </AlertDescription>
        </Alert>
      )}
      {hint && hasValue && (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function HaConfigDialog({ device, open, onOpenChange }: HaConfigDialogProps) {
  const { tenant } = useTenant();

  // Derive cloud_url from current Supabase project
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const cloudUrl = projectId
    ? `https://${projectId}.supabase.co/functions/v1/gateway-ingest`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            HA-Add-on-Konfiguration: {device.device_name}
          </DialogTitle>
          <DialogDescription>
            Diese Werte 1:1 in das Home-Assistant Add-on{" "}
            <code className="text-xs bg-muted px-1 rounded">AICONO EMS Gateway</code>{" "}
            → Tab <strong>Konfiguration</strong> übernehmen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <CopyRow
            label="cloud_url"
            value={cloudUrl}
            hint="Endpoint, an den das Gateway Heartbeats und Messdaten sendet."
          />

          <CopyRow
            label="tenant_id"
            value={tenant?.id}
            hint="UUID des Mandanten."
          />

          <CopyRow
            label="device_name"
            value={device.device_name}
            hint="Eindeutiger Gerätename — muss exakt mit diesem Eintrag übereinstimmen."
          />

          <CopyRow
            label="gateway_api_key"
            value={null}
            missingHint="Aus Sicherheitsgründen nicht abrufbar. Falls verloren: Schlüssel-Symbol (🔑) auf der Kachel klicken und neuen Key generieren — der alte wird damit ungültig."
          />

          <CopyRow
            label="cloudflare_tunnel_token"
            value={null}
            missingHint="Wird nur einmalig nach Provisionierung im Klartext angezeigt. Falls verloren: Integration bearbeiten und über „Tunnel-Token neu generieren“ einen neuen Token erzeugen."
          />

          <Alert className="bg-muted/50">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Nach dem Einfügen aller Werte: Add-on speichern → <strong>Neu starten</strong>.
              Der Status hier wechselt innerhalb ~60 Sek. auf 🟢 Online.
            </AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
}
