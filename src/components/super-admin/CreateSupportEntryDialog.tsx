import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const ACTIONS = [
  { value: "support_session", label: "Support-Sitzung" },
  { value: "phone_call", label: "Telefonat" },
  { value: "email_support", label: "E-Mail-Support" },
  { value: "other", label: "Sonstiges" },
];

async function upsertSupportInvoiceEntry(tenantId: string, session: any) {
  const now = new Date(session.started_at);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  // Check if tenant has remote_support (flatrate)
  const { data: flatrateMod } = await supabase
    .from("tenant_modules")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("module_code", "remote_support")
    .eq("is_enabled", true)
    .maybeSingle();

  // Get tenant support price
  const { data: tenant } = await supabase
    .from("tenants")
    .select("support_price_per_15min")
    .eq("id", tenantId)
    .single();

  const hasFlat = !!flatrateMod;
  const price15 = Number(tenant?.support_price_per_15min ?? 25);
  const durationMin = session.duration_minutes ?? Math.max(1, Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000));
  const blocks = Math.ceil(durationMin / 15);
  const cost = hasFlat ? 0 : blocks * price15;

  const newLineItem = {
    type: "support",
    session_id: session.id,
    started_at: session.started_at,
    duration_min: durationMin,
    blocks_15min: blocks,
    price_per_block: hasFlat ? 0 : price15,
    amount: cost,
    reason: session.reason,
  };

  // Find existing non-Lexware invoice for this tenant+month to merge into
  const { data: existingList } = await supabase
    .from("tenant_invoices")
    .select("*")
    .eq("tenant_id", tenantId)
    .gte("period_start", fmt(monthStart))
    .lte("period_start", fmt(monthEnd))
    .neq("status", "voided")
    .is("lexware_invoice_id", null)
    .order("created_at", { ascending: true })
    .limit(1);
  const existing = existingList?.[0] ?? null;

  if (existing) {
    const lineItems = [...(Array.isArray(existing.line_items) ? existing.line_items : []), newLineItem] as any;
    const supportTotal = Number(existing.support_total ?? 0) + cost;
    const { error } = await supabase
      .from("tenant_invoices")
      .update({
        period_start: fmt(monthStart),
        period_end: fmt(monthEnd),
        line_items: lineItems,
        support_total: supportTotal,
        amount: Number(existing.module_total ?? 0) + supportTotal,
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("tenant_invoices")
      .insert({
        tenant_id: tenantId,
        invoice_number: `DRAFT`,
        period_start: fmt(monthStart),
        period_end: fmt(monthEnd),
        amount: cost,
        module_total: 0,
        support_total: cost,
        status: "draft",
        line_items: [newLineItem],
      } as any);
    if (error) throw error;
  }
}

const CreateSupportEntryDialog = () => {
  const [open, setOpen] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [duration, setDuration] = useState("");
  const [action, setAction] = useState("support_session");
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: tenants = [] } = useQuery({
    queryKey: ["all-tenants-for-support"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const createEntry = useMutation({
    mutationFn: async () => {
      const durationMin = parseInt(duration, 10);
      if (!tenantId || !durationMin || durationMin <= 0) {
        throw new Error("Bitte alle Pflichtfelder ausfüllen");
      }
      const now = new Date();
      const endedAt = new Date(now.getTime());
      const startedAt = new Date(now.getTime() - durationMin * 60000);
      const reasonText = ACTIONS.find((a) => a.value === action)?.label ?? action;

      // 1. Insert support session
      const { data: session, error } = await supabase.from("support_sessions").insert({
        tenant_id: tenantId,
        super_admin_user_id: user!.id,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        expires_at: endedAt.toISOString(),
        duration_minutes: durationMin,
        is_manual: true,
        reason: reasonText,
        notes: notes || null,
      } as any).select().single();
      if (error) throw error;

      // 2. Upsert current-month invoice with new support line item
      await upsertSupportInvoiceEntry(tenantId, session as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-invoices"] });
      toast.success("Support-Eintrag erstellt");
      setOpen(false);
      setTenantId("");
      setDuration("");
      setAction("support_session");
      setNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Support-Eintrag erstellen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Support-Eintrag erstellen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Kunde</Label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger>
                <SelectValue placeholder="Kunde wählen" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Dauer (Minuten)</Label>
            <Input
              type="number"
              min={1}
              placeholder="z.B. 30"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Aktion</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIONS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notizen (optional)</Label>
            <Textarea
              placeholder="Beschreibung der Support-Leistung..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            onClick={() => createEntry.mutate()}
            disabled={createEntry.isPending}
          >
            Eintrag erstellen & Abrechnung erzeugen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateSupportEntryDialog;
