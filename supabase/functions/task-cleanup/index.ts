// Daily cleanup job: auto-archive completed tasks and delete old archived tasks.
// Triggered by pg_cron with service-role auth.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const { data: tenants, error: tErr } = await supabase
      .from("tenants")
      .select("id, task_auto_archive_days, task_auto_delete_days, task_protect_external");
    if (tErr) throw tErr;

    let totalArchived = 0;
    let totalDeleted = 0;

    for (const tenant of tenants ?? []) {
      const archiveDays = Number(tenant.task_auto_archive_days ?? 0);
      const deleteDays = Number(tenant.task_auto_delete_days ?? 0);
      const protectExternal = Boolean(tenant.task_protect_external ?? true);

      // 1) Auto-archive
      if (archiveDays > 0) {
        const cutoff = new Date(Date.now() - archiveDays * 86400000).toISOString();
        const { data: archived, error: aErr } = await supabase
          .from("tasks")
          .update({ archived_at: new Date().toISOString() })
          .eq("tenant_id", tenant.id)
          .is("archived_at", null)
          .in("status", ["done", "cancelled"])
          .lt("updated_at", cutoff)
          .select("id");
        if (aErr) console.error("archive error", tenant.id, aErr);
        else totalArchived += archived?.length ?? 0;
      }

      // 2) Auto-delete
      if (deleteDays > 0) {
        const cutoff = new Date(Date.now() - deleteDays * 86400000).toISOString();
        let q = supabase
          .from("tasks")
          .select("id, external_contact_name")
          .eq("tenant_id", tenant.id)
          .not("archived_at", "is", null)
          .lt("archived_at", cutoff);
        const { data: candidates, error: cErr } = await q;
        if (cErr) { console.error("select-delete error", tenant.id, cErr); continue; }
        const ids = (candidates ?? [])
          .filter((t: any) => !(protectExternal && t.external_contact_name))
          .map((t: any) => t.id);
        if (ids.length === 0) continue;

        // Cascade-friendly: clear integration_errors links first
        await supabase.from("integration_errors").delete().in("task_id", ids).eq("tenant_id", tenant.id);

        for (let i = 0; i < ids.length; i += 100) {
          const batch = ids.slice(i, i + 100);
          const { error: dErr } = await supabase
            .from("tasks").delete().in("id", batch).eq("tenant_id", tenant.id);
          if (dErr) console.error("delete error", tenant.id, dErr);
          else totalDeleted += batch.length;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, archived: totalArchived, deleted: totalDeleted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("task-cleanup failed", e);
    return new Response(
      JSON.stringify({ success: false, error: String((e as Error).message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
