import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ALL_MODULES } from "@/hooks/useTenantModules";
import { toast } from "sonner";

interface Props {
  partnerId: string | null;
  partnerName?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

/** Super-Admin pflegt das Modul-Portfolio eines Partners (Modul-Kaskade). */
export function PartnerModulesDialog({ partnerId, partnerName, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data: codes = [] } = useQuery({
    queryKey: ["partner-modules-admin", partnerId],
    enabled: open && !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_modules").select("module_code").eq("partner_id", partnerId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.module_code);
    },
  });

  const toggle = async (code: string, on: boolean) => {
    if (!partnerId) return;
    setBusy(code);
    const { error } = on
      ? await supabase.from("partner_modules").insert({ partner_id: partnerId, module_code: code })
      : await supabase.from("partner_modules").delete().eq("partner_id", partnerId).eq("module_code", code);
    setBusy(null);
    if (error) return toast.error("Speichern fehlgeschlagen: " + error.message);
    qc.invalidateQueries({ queryKey: ["partner-modules-admin", partnerId] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Module für {partnerName ?? "Partner"}</DialogTitle>
          <DialogDescription>
            Nur hier freigeschaltete Module kann der Partner an seine Mandanten weitergeben.
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y">
          {ALL_MODULES.filter((m) => !(m as any).alwaysOn).map((m) => (
            <div key={m.code} className="flex items-center justify-between gap-4 py-2">
              <span className="text-sm">{m.label}</span>
              <Switch checked={codes.includes(m.code)} disabled={busy === m.code} onCheckedChange={(v) => toggle(m.code, v)} />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PartnerModulesDialog;
