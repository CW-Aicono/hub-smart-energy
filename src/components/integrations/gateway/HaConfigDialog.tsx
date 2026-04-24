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
  // v3.0: WebSocket-Push. Identifikation über MAC-Adresse + Benutzer/Passwort.
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const cloudWsUrl = projectId
    ? `wss://${projectId}.supabase.co/functions/v1/gateway-ws`
    : null;
  const hasTenantId = Boolean(device.tenant_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            AICONO Gateway-Konfiguration: {device.device_name}
          </DialogTitle>
          <DialogDescription>
            Diese Werte 1:1 in das Add-on{" "}
            <code className="text-xs bg-muted px-1 rounded">AICONO EMS Gateway</code>{" "}
            → Tab <strong>Konfiguration</strong> übernehmen. Für die Verbindung werden
            nur WebSocket-URL, MAC-Adresse, Benutzername und Passwort benötigt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <CopyRow
            label="cloud_ws_url"
            value={cloudWsUrl}
            hint="WebSocket-Endpoint für die persistente Push-Verbindung zur Cloud."
          />

          <CopyRow
            label="mac_address"
            value={device.mac_address}
            hint="MAC-Adresse des Raspberry Pi — eindeutige Identifikation des Gateways. Wird außerdem im lokalen Gateway-Dashboard angezeigt."
            missingHint="Wird automatisch beim ersten Verbindungsaufbau des Gateways gesetzt."
          />

          {hasTenantId && (
            <CopyRow
              label="tenant_id"
              value={device.tenant_id}
              hint="Nur für Legacy-/Fallback-Fälle relevant. Im aktuellen v3-Onboarding wird die Zuordnung primär über MAC-Adresse und Zugangsdaten hergestellt."
            />
          )}

          <CopyRow
            label="gateway_username"
            value={device.gateway_username}
            missingHint="Beim Erstellen der Integration vergeben. Falls verloren: Integration neu konfigurieren."
          />

          <CopyRow
            label="gateway_password"
            value={null}
            missingHint="Aus Sicherheitsgründen nicht abrufbar (bcrypt-Hash). Falls verloren: Passwort in der Integration neu setzen."
          />

          <Alert className="bg-muted/50">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Nach dem Einfügen aller Werte: Add-on speichern → <strong>Neu starten</strong>.
              Die MAC-Adresse wird lokal automatisch erkannt. Danach erscheint das Gateway in AICONO zur Zuordnung und der Status wechselt innerhalb weniger Sekunden auf 🟢 Online.
            </AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
}
