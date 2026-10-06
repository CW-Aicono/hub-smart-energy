import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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

const TIMEOUT_MS = 15000;

/** Super-Admin pflegt das Modul-Portfolio eines Partners (Modul-Kaskade). */
export function PartnerModulesDialog({ partnerId, partnerName, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [local, setLocal] = useState<string[]>([]);
  const { data: codes, error: loadError, refetch } = useQuery({
    queryKey: ["partner-modules-admin", partnerId],
    enabled: open && !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_modules").select("module_code").eq("partner_id", partnerId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.module_code);
    },
  });

  useEffect(() => { if (codes) setLocal(codes); }, [codes]);

  const toggle = async (code: string, on: boolean) => {
    if (!partnerId) return;
    // Sofort umschalten, bei Fehler zurück.
    setLocal((prev) => (on ? [...new Set([...prev, code])] : prev.filter((c) => c !== code)));
    setBusy((b) => new Set(b).add(code));
    try {
      const call = supabase.functions.invoke("super-admin-set-partner-module", {
        body: { partner_id: partnerId, module_code: code, enabled: on },
      });
      const timeout = new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("Keine Antwort vom Server (Zeitüberschreitung). Ist die Funktion auf diesem System installiert?")), TIMEOUT_MS),
      );
      const { data, error } = await Promise.race([call, timeout]);
      if (error || data?.error || data?.success !== true) {
        let msg = data?.error ?? error?.message ?? "Unerwartete Antwort vom Server";
        try { msg = (await (error as any)?.context?.json())?.error ?? msg; } catch { /* noop */ }
        throw new Error(msg);
      }
    } catch (e) {
      setLocal((prev) => (on ? prev.filter((c) => c !== code) : [...new Set([...prev, code])]));
      toast.error("Speichern fehlgeschlagen: " + (e as Error).message);
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(code); return n; });
      qc.invalidateQueries({ queryKey: ["partner-modules-admin", partnerId] });
      refetch();
    }
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
        {loadError && (
          <p className="text-sm text-destructive">
            Modulliste konnte nicht geladen werden: {(loadError as Error).message}. Auf dem Live-System fehlt evtl. noch die Datenbank-Änderung – bitte Deploy ausführen.
          </p>
        )}
        <div className="divide-y">
          {ALL_MODULES.filter((m) => !(m as any).alwaysOn).map((m) => (
            <div key={m.code} className="flex items-center justify-between gap-4 py-2">
              <span className="text-sm">{m.label}</span>
              <Switch checked={local.includes(m.code)} disabled={busy.has(m.code)} onCheckedChange={(v) => toggle(m.code, v)} />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PartnerModulesDialog;
