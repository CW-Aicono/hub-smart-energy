import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings2 } from "lucide-react";
import { useTenantModules, ALL_MODULES } from "@/hooks/useTenantModules";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface TenantModulesDialogProps {
  tenantId: string;
  tenantName: string;
}

const TenantModulesDialog = ({ tenantId, tenantName }: TenantModulesDialogProps) => {
  const [open, setOpen] = useState(false);
  const { modules } = useTenantModules(open ? tenantId : null);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  // Portal-Weg: serverseitig geprüft, ergänzt bei Partner-Kunden das Partner-Portfolio.
  const setModule = async (code: string, enabled: boolean) => {
    setBusy(code);
    try {
      const { data, error } = await supabase.functions.invoke("portal-set-tenant-module", {
        body: { tenant_id: tenantId, module_code: code, enabled },
      });
      if (error || data?.success !== true) {
        let msg = data?.error ?? error?.message ?? "Unerwartete Antwort";
        try { msg = (await (error as any)?.context?.json())?.error ?? msg; } catch { /* noop */ }
        throw new Error(msg);
      }
      toast.success(enabled ? "Modul aktiviert" : "Modul deaktiviert");
    } catch (e) {
      toast.error("Speichern fehlgeschlagen: " + (e as Error).message);
    } finally {
      setBusy(null);
      qc.invalidateQueries();
    }
  };

  const getModuleEnabled = (code: string) => {
    const mod = modules.find((m) => m.module_code === code);
    return mod ? mod.is_enabled : false;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Module verwalten">
          <Settings2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Module – {tenantName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {ALL_MODULES.map((mod) => (
            <div key={mod.code} className="flex items-center justify-between">
              <Label className="text-base">{mod.label}</Label>
              {"alwaysOn" in mod ? (
                <Badge variant="secondary">Immer aktiv</Badge>
              ) : (
                <Switch
                  checked={getModuleEnabled(mod.code)}
                  disabled={busy === mod.code}
                  onCheckedChange={(checked) => setModule(mod.code, checked)}
                />
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TenantModulesDialog;
