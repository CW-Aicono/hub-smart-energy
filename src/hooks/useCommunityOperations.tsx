// Iter C – Hooks für MSCONS-Imports, Allokationsläufe, Rechnungen, Datenqualität.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";

// ── MSCONS-Imports ────────────────────────────────────────────────────────────
export function useMsconsImports(communityId: string | null) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const { data: imports = [], isLoading } = useQuery({
    queryKey: ["mscons-imports", communityId, tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase.from("smart_meter_mscons_imports")
        .select("*").eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false }).limit(50);
      if (communityId) q = q.eq("community_id", communityId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const uploadFile = useMutation({
    mutationFn: async ({ file, communityId: cid }: { file: File; communityId: string }) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("community_id", cid);
      const { data, error } = await supabase.functions.invoke("smart-meter-mscons-import", { body: fd });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["mscons-imports"] });
      toast({
        title: data?.deduplicated ? "Datei bereits importiert" : "Import abgeschlossen",
        description: data?.deduplicated
          ? "Diese Datei wurde schon hochgeladen."
          : `${(data?.imported ?? 0).toLocaleString("de-DE")} Werte importiert, ${(data?.skipped ?? 0).toLocaleString("de-DE")} übersprungen.`,
      });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { imports, isLoading, uploadFile };
}

// ── Allocation Runs ───────────────────────────────────────────────────────────
export function useAllocationRuns(communityId: string | null) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["allocation-runs", communityId, tenantId],
    enabled: !!tenantId && !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase.from("community_allocation_runs")
        .select("*").eq("community_id", communityId!)
        .order("started_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const runAllocation = useMutation({
    mutationFn: async ({ period_start, period_end }: { period_start: string; period_end: string }) => {
      const { data, error } = await supabase.functions.invoke("community-allocation-run", {
        body: { community_id: communityId, period_start, period_end },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["allocation-runs"] });
      qc.invalidateQueries({ queryKey: ["community-data-quality"] });
      toast({
        title: "Verteilung berechnet",
        description: `${Number(data?.total_allocated_kwh ?? 0).toLocaleString("de-DE", { maximumFractionDigits: 2 })} kWh verteilt.`,
      });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { runs, isLoading, runAllocation };
}

// ── Invoices ──────────────────────────────────────────────────────────────────
export function useMemberInvoices(communityId: string | null) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["member-invoices", communityId, tenantId],
    enabled: !!tenantId && !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase.from("community_member_invoices")
        .select("*, community_members(display_name, email)")
        .eq("community_id", communityId!)
        .order("period_start", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const runBilling = useMutation({
    mutationFn: async ({ year, month }: { year: number; month: number }) => {
      const { data, error } = await supabase.functions.invoke("community-billing-run", {
        body: { community_id: communityId, year, month },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["member-invoices"] });
      toast({
        title: "Abrechnung erstellt",
        description: `${(data?.invoices_processed ?? 0).toLocaleString("de-DE")} Rechnungen erzeugt/aktualisiert.`,
      });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "draft" | "issued" | "paid" | "voided" }) => {
      const patch: any = { status };
      if (status === "issued") patch.issued_at = new Date().toISOString();
      if (status === "paid") patch.paid_at = new Date().toISOString();
      const { error } = await supabase.from("community_member_invoices").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["member-invoices"] });
      toast({ title: "Status aktualisiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { invoices, isLoading, runBilling, setStatus };
}

// ── Data Quality ──────────────────────────────────────────────────────────────
export function useCommunityDataQuality(communityId: string | null) {
  return useQuery({
    queryKey: ["community-data-quality", communityId],
    enabled: !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("community_data_quality", { p_community_id: communityId! });
      if (error) throw error;
      return (data?.[0] ?? null) as null | {
        members_total: number;
        members_with_recent_data: number;
        coverage_pct: number;
        last_reading_at: string | null;
        assets_total: number;
        active_run_at: string | null;
      };
    },
  });
}
