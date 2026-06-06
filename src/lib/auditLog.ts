import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "tenant.status_change"
  | "tenant.update"
  | "tenant.delete"
  | "module.toggle"
  | "pricing.update"
  | "bundle.update"
  | "partner.create"
  | "partner.update"
  | "partner.delete"
  | "member.remove"
  | "member.add"
  | "license.change"
  | string;

export type AuditPayload = {
  action: AuditAction;
  entity_type: string;
  entity_id?: string | null;
  entity_label?: string | null;
  tenant_id?: string | null;
  partner_id?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

/**
 * Fire-and-forget Audit-Log Schreiber.
 * Fehler werden geloggt, blockieren aber nie die aufrufende User-Aktion.
 */
export async function writeAuditLog(payload: AuditPayload): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("audit-log-write", {
      body: payload,
    });
    if (error) {
      console.warn("[audit-log] write failed", error, payload.action);
    }
  } catch (e) {
    console.warn("[audit-log] exception", e);
  }
}
