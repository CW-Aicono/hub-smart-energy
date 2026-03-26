import { Info, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useTenant } from "@/hooks/useTenant";
import { GatewaySetupInstructions } from "@/lib/gatewayRegistry";

interface SchneiderSetupInfoProps {
  config: Record<string, unknown>;
  setupInstructions: GatewaySetupInstructions;
}

export function SchneiderSetupInfo({ config, setupInstructions }: SchneiderSetupInfoProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { tenant } = useTenant();

  const supabaseHost = import.meta.env.VITE_SUPABASE_URL
    ? new URL(import.meta.env.VITE_SUPABASE_URL).host
    : "";

  const server = setupInstructions.serverField === "__supabase_host__"
    ? supabaseHost
    : String(config[setupInstructions.serverField] || "");

  const path = setupInstructions.pathTemplate.replace(
    "{tenant_id}",
    (tenant?.id as string) || "<tenant_id>"
  );

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} kopiert` });
  };

  const rows = [
    { label: "Server", value: server },
    { label: "Port", value: setupInstructions.port },
    { label: "Pfad", value: path },
    { label: "Verbindungsmethode", value: setupInstructions.authMethod },
    { label: "Benutzername", value: String(config.push_username || "") },
    { label: "Passwort", value: String(config.push_password || ""), masked: true },
  ];

  return (
    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <Info className="h-4 w-4" />
        HTTPS-Publikation einrichten
      </div>
      <p className="text-xs text-muted-foreground">
        Konfigurieren Sie im EcoStruxure Panel Server unter <strong>Einstellungen → HTTPS-Publikation</strong> folgende Werte:
      </p>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground w-36 shrink-0">{row.label}:</span>
            <code className="bg-muted px-1.5 py-0.5 rounded text-foreground break-all flex-1">
              {row.masked ? "••••••••" : row.value}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0"
              onClick={() => copyToClipboard(row.value, row.label)}
              title={`${row.label} kopieren`}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
