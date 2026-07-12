import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowRightLeft, History, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  tenantId: string;
  tenantName: string;
  currentPartnerId: string | null;
}

interface Partner { id: string; name: string; is_active: boolean }

interface TransferRow {
  id: string;
  created_at: string;
  reason: string;
  from_partner_id: string | null;
  to_partner_id: string | null;
  from_support_owner: string | null;
  to_support_owner: string | null;
  performed_by: string | null;
}

const PLATFORM = "__platform__";

export default function TenantPartnerTransferCard({
  tenantId, tenantName, currentPartnerId,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>(PLATFORM);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ["sa-transfer-partner-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("id, name, is_active")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Partner[];
    },
  });

  const { data: history = [], refetch: refetchHistory } = useQuery<TransferRow[]>({
    queryKey: ["tenant-partner-transfers", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_partner_transfers")
        .select("id, created_at, reason, from_partner_id, to_partner_id, from_support_owner, to_support_owner, performed_by")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TransferRow[];
    },
  });

  const partnerName = (id: string | null) =>
    id ? (partners.find((p) => p.id === id)?.name ?? "Unbekannt") : "Direkt AICONO";

  const activePartners = partners.filter((p) => p.is_active !== false);

  const handleSubmit = async () => {
    if (reason.trim().length < 5) {
      toast({ title: "Grund erforderlich", description: "Mindestens 5 Zeichen.", variant: "destructive" });
      return;
    }
    const targetPartnerId = target === PLATFORM ? null : target;
    if (targetPartnerId === currentPartnerId) {
      toast({ title: "Keine Änderung", description: "Ziel entspricht der aktuellen Zuordnung.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("super-admin-transfer-tenant", {
        body: { tenant_id: tenantId, target_partner_id: targetPartnerId, reason: reason.trim() },
      });
      const res: any = typeof data === "string" ? JSON.parse(data) : data;
      if (error || !res?.success) throw new Error(res?.error || error?.message || "Übertragung fehlgeschlagen");
      toast({ title: "Mandant übertragen", description: `${tenantName} wurde ${targetPartnerId ? "einem neuen Partner" : "AICONO direkt"} zugeordnet.` });
      setOpen(false);
      setReason("");
      setTarget(PLATFORM);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["super-admin-tenants"] }),
        qc.invalidateQueries({ queryKey: ["tenant", tenantId] }),
        refetchHistory(),
      ]);
      // Force a full reload so all cached partner-scoped views recompute
      qc.invalidateQueries();
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message ?? "Unbekannt", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4" /> Partner-Zuordnung übertragen
        </CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}>
          <ArrowRightLeft className="h-4 w-4 mr-2" /> Partner wechseln
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Aktuell zugeordnet: <Badge variant="secondary">{partnerName(currentPartnerId)}</Badge>
        </div>

        <div>
          <div className="flex items-center gap-2 text-sm font-semibold mb-2">
            <History className="h-4 w-4" /> Partner-Historie
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Übertragungen dokumentiert.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="text-sm border rounded-md p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{partnerName(h.from_partner_id)}</Badge>
                    <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="secondary">{partnerName(h.to_partner_id)}</Badge>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(h.created_at).toLocaleString("de-DE")}
                    </span>
                  </div>
                  <p className="mt-2 text-muted-foreground">{h.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setReason(""); setTarget(PLATFORM); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mandant an anderen Partner übertragen</DialogTitle>
            <DialogDescription>
              „{tenantName}" wird dem gewählten Ziel zugeordnet. Der bisherige Partner verliert
              sofort Zugriff und Remote-Support-Rechte.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Aktueller Partner</Label>
              <div><Badge variant="outline">{partnerName(currentPartnerId)}</Badge></div>
            </div>

            <div className="space-y-2">
              <Label>Neues Ziel *</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={PLATFORM}>Direkt AICONO (Super-Admin)</SelectItem>
                  {activePartners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Grund *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="z. B. Partner-Status entzogen, Kunde wechselt Partner ..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">Mindestens 5 Zeichen. Wird in der Historie gespeichert.</p>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <span>
                Diese Aktion wirkt sofort. Bestehende Partner-Members verlieren den Zugriff auf diesen Mandanten.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Abbrechen</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Übertragen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
