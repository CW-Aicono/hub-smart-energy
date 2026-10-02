import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AuditLogRow = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  tenant_id: string | null;
  partner_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  before: unknown;
  after: unknown;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
};

type Params = {
  tenantId?: string | null;
  partnerId?: string | null;
  action?: string | null;
  daysBack?: number; // 7 | 30 | 90
  limit?: number;
};

export function useAuditLogs({
  tenantId,
  partnerId,
  action,
  daysBack = 30,
  limit = 200,
}: Params = {}) {
  return useQuery({
    queryKey: ["audit-logs", { tenantId, partnerId, action, daysBack, limit }],
    queryFn: async () => {
      const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
      let q = supabase
        .from("audit_logs")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (tenantId) q = q.eq("tenant_id", tenantId);
      if (partnerId) q = q.eq("partner_id", partnerId);
      if (action) q = q.eq("action", action);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditLogRow[];
    },
    staleTime: 30_000,
  });
}
