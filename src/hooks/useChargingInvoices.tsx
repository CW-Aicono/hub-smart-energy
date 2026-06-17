import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useTenant } from "@/hooks/useTenant";

export interface ChargingInvoiceSession {
  id: string;
  start_time: string;
  stop_time: string | null;
  energy_kwh: number;
  id_tag: string | null;
}

export interface ChargingInvoiceTag {
  tag: string;
  label: string | null;
}

export interface ChargingInvoice {
  id: string;
  tenant_id: string;
  session_id: string | null;
  user_id: string | null;
  billing_group_id: string | null;
  tariff_id: string | null;
  total_energy_kwh: number;
  total_amount: number;
  net_amount: number;
  tax_amount: number;
  tax_rate_percent: number;
  idle_fee_amount: number;
  currency: string;
  status: string;
  invoice_number: string | null;
  invoice_date: string;
  period_start: string | null;
  period_end: string | null;
  issued_at: string | null;
  email_sent_at: string | null;
  email_send_count: number;
  created_at: string;
  // Joined data
  user_name?: string;
  user_email?: string;
  billing_group_name?: string;
  user_tags?: ChargingInvoiceTag[];
  sessions?: ChargingInvoiceSession[];
  tariff_price_per_kwh?: number;
  tariff_idle_fee_per_minute?: number;
  tariff_idle_fee_grace_minutes?: number;
}

export function useChargingInvoices() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["charging-invoices", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charging_invoices")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const invs = (data ?? []) as ChargingInvoice[];
      if (invs.length === 0) return invs;

      const userIds = Array.from(new Set(invs.map(i => i.user_id).filter(Boolean) as string[]));
      const invoiceIds = invs.map(i => i.id);
      const tariffIds = Array.from(new Set(invs.map(i => i.tariff_id).filter(Boolean) as string[]));
      const groupIds = Array.from(new Set(invs.map(i => i.billing_group_id).filter(Boolean) as string[]));

      const [usersRes, tagsRes, linksRes, tariffsRes, groupsRes] = await Promise.all([
        userIds.length
          ? supabase.from("charging_users").select("id, name, email").in("id", userIds)
          : Promise.resolve({ data: [] } as any),
        userIds.length
          ? supabase.from("charging_user_rfid_tags").select("user_id, tag, label").in("user_id", userIds)
          : Promise.resolve({ data: [] } as any),
        supabase
          .from("charging_invoice_sessions")
          .select("invoice_id, charging_sessions(id, start_time, stop_time, energy_kwh, id_tag)")
          .in("invoice_id", invoiceIds),
        tariffIds.length
          ? supabase.from("charging_tariffs").select("id, price_per_kwh, idle_fee_per_minute, idle_fee_grace_minutes").in("id", tariffIds)
          : Promise.resolve({ data: [] } as any),
        groupIds.length
          ? supabase.from("charging_billing_groups").select("id, name").in("id", groupIds)
          : Promise.resolve({ data: [] } as any),
      ]);

      const userById = new Map<string, any>();
      for (const u of (usersRes.data ?? [])) userById.set((u as any).id, u);
      const tagsByUser = new Map<string, ChargingInvoiceTag[]>();
      for (const t of (tagsRes.data ?? [])) {
        const arr = tagsByUser.get((t as any).user_id) ?? [];
        arr.push({ tag: (t as any).tag, label: (t as any).label });
        tagsByUser.set((t as any).user_id, arr);
      }
      const sessionsByInvoice = new Map<string, ChargingInvoiceSession[]>();
      for (const link of (linksRes.data ?? [])) {
        const s = (link as any).charging_sessions;
        if (!s) continue;
        const arr = sessionsByInvoice.get((link as any).invoice_id) ?? [];
        arr.push(s);
        sessionsByInvoice.set((link as any).invoice_id, arr);
      }
      const tariffById = new Map<string, any>();
      for (const t of (tariffsRes.data ?? [])) tariffById.set((t as any).id, t);
      const groupById = new Map<string, any>();
      for (const g of (groupsRes.data ?? [])) groupById.set((g as any).id, g);

      return invs.map(inv => {
        const u = inv.user_id ? userById.get(inv.user_id) : null;
        const g = inv.billing_group_id ? groupById.get(inv.billing_group_id) : null;
        const tariff = inv.tariff_id ? tariffById.get(inv.tariff_id) : null;
        const sessions = (sessionsByInvoice.get(inv.id) ?? []).sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        );
        return {
          ...inv,
          user_name: u?.name ?? g?.name,
          user_email: u?.email,
          billing_group_name: g?.name,
          user_tags: inv.user_id ? (tagsByUser.get(inv.user_id) ?? []) : [],
          sessions,
          tariff_price_per_kwh: tariff?.price_per_kwh,
          tariff_idle_fee_per_minute: tariff?.idle_fee_per_minute,
          tariff_idle_fee_grace_minutes: tariff?.idle_fee_grace_minutes,
        };
      });
    },
  });

  const createInvoice = useMutation({
    mutationFn: async (invoice: Partial<ChargingInvoice> & { tenant_id: string }) => {
      const { data, error } = await supabase.from("charging_invoices").insert(invoice).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-invoices"] });
      toast({ title: "Rechnung erstellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const generateInvoices = useMutation({
    mutationFn: async (params: { tenant_id: string; period_start: string; period_end: string }) => {
      const { data, error } = await supabase.functions.invoke("send-charging-invoices", {
        body: {
          tenant_id: params.tenant_id,
          period_start: params.period_start,
          period_end: params.period_end,
          mode: "generate",
        },
      });
      if (error) throw error;
      const createdIds: string[] = (data?.results ?? []).flatMap((r: any) => r?.created_invoice_ids ?? []);
      return { ...data, created_invoice_ids: createdIds };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["charging-invoices"] });
      const count = data?.results?.[0]?.invoices_created ?? 0;
      toast({ title: `${count} Rechnung(en) erstellt` });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const sendInvoices = useMutation({
    mutationFn: async (params: { tenant_id: string; period_start: string; period_end: string }) => {
      const { data, error } = await supabase.functions.invoke("send-charging-invoices", {
        body: {
          tenant_id: params.tenant_id,
          period_start: params.period_start,
          period_end: params.period_end,
          mode: "send",
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["charging-invoices"] });
      const count = data?.results?.[0]?.emails_sent ?? 0;
      toast({ title: `${count} Rechnung(en) versendet` });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  /** Send a specific set of invoices by ID. Skips drafts unless allowDraft=true. */
  const sendSelectedInvoices = useMutation({
    mutationFn: async (params: { invoice_ids: string[]; allow_draft?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("send-charging-invoices", {
        body: { mode: "send-selected", invoice_ids: params.invoice_ids, allow_draft: !!params.allow_draft },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["charging-invoices"] });
      const sent = data?.sent ?? 0;
      const failed = (data?.results ?? []).filter((r: any) => !r.ok);
      const reasons = failed
        .map((r: any) => r.error || r.skipped)
        .filter(Boolean) as string[];
      const uniqueReasons = Array.from(new Set(reasons));
      toast({
        title: `${sent} Rechnung(en) versendet`,
        description: failed.length > 0
          ? `${failed.length} nicht versendet${uniqueReasons.length ? `: ${uniqueReasons.join("; ")}` : ""}`
          : undefined,
        variant: sent === 0 && failed.length > 0 ? "destructive" : "default",
      });
    },

    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const finalizeInvoice = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from("charging_invoices")
        .update({ status: "issued", issued_at: new Date().toISOString() })
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-invoices"] });
      toast({ title: "Rechnung ausgestellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  /** Mark multiple invoices as issued at once (only those currently in draft). */
  const finalizeInvoices = useMutation({
    mutationFn: async (invoiceIds: string[]) => {
      if (invoiceIds.length === 0) return { count: 0 };
      const { error, count } = await supabase
        .from("charging_invoices")
        .update({ status: "issued", issued_at: new Date().toISOString() }, { count: "exact" })
        .in("id", invoiceIds)
        .eq("status", "draft");
      if (error) throw error;
      return { count: count ?? 0 };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["charging-invoices"] });
      toast({ title: `${data.count} Rechnung(en) ausgestellt` });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const markAsPaid = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from("charging_invoices")
        .update({ status: "paid" })
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-invoices"] });
      toast({ title: "Rechnung als bezahlt markiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { invoices, isLoading, createInvoice, generateInvoices, sendInvoices, sendSelectedInvoices, finalizeInvoice, finalizeInvoices, markAsPaid };
}
