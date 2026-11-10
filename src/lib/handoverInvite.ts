import { supabase } from "@/integrations/supabase/client";

/** Sendet nach der Übergabe die Zugangsmail an den bei Anlage hinterlegten Kunden-Admin. */
export async function sendHandoverInvite(tenantId: string): Promise<{ ok: boolean; text: string }> {
  const { data: t } = await (supabase as any).from("tenants").select("handover_admin_email, handover_admin_name").eq("id", tenantId).maybeSingle();
  const email = t?.handover_admin_email as string | null;
  if (!email) return { ok: true, text: "Kein Kunden-Admin hinterlegt – Einladung bitte über Benutzer versenden." };
  const { data, error } = await supabase.functions.invoke("invite-tenant-admin", {
    body: { tenantId, adminEmail: email, adminName: t?.handover_admin_name || undefined, redirectTo: `${window.location.origin}/set-password` },
  });
  let res: any = typeof data === "string" ? JSON.parse(data) : data;
  if (error && !res?.error) {
    const txt = (error as any)?.context?.text; if (txt) { try { res = JSON.parse(txt); } catch { /* ignore */ } }
  }
  if (error || !res?.success) return { ok: false, text: res?.error || error?.message || "Einladung fehlgeschlagen" };
  return { ok: true, text: `Zugangsmail an ${email} gesendet.` };
}
