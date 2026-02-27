import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Tables to back up, grouped by category */
const BACKUP_TABLES: Record<string, string[]> = {
  configuration: [
    "tenants", "locations", "floors", "floor_rooms", "meters",
    "virtual_meter_sources", "integrations", "location_integrations",
    "alert_rules", "location_automations", "energy_prices",
    "dashboard_widgets", "email_templates", "pv_forecast_settings",
    "integration_categories",
  ],
  users: [
    "profiles", "user_roles", "user_location_access", "user_preferences",
    "custom_roles", "custom_role_permissions",
  ],
  measurements: [
    "meter_period_totals", "meter_readings", "energy_readings",
  ],
  charging: [
    "charge_points", "charging_sessions", "charging_users",
    "charging_tariffs", "charging_invoices", "charge_point_groups",
    "charging_user_groups", "charge_point_allowed_user_groups",
    "charge_point_group_allowed_user_groups",
  ],
  tasks: ["tasks", "task_history"],
  other: [
    "report_schedules", "brighthub_settings", "tenant_modules",
    "energy_storages", "arbitrage_strategies", "arbitrage_trades",
    "floor_sensor_positions",
  ],
};

/** Tables where tenant scoping uses a different column or approach */
const NON_TENANT_TABLES = new Set([
  "dashboard_widgets", "user_preferences", "user_location_access",
  "virtual_meter_sources", "floor_rooms", "floor_sensor_positions",
  "custom_role_permissions", "charge_point_allowed_user_groups",
  "charge_point_group_allowed_user_groups",
]);

/** Tables scoped via user_id of tenant users */
const USER_SCOPED_TABLES = new Set([
  "dashboard_widgets", "user_preferences", "user_location_access",
]);

async function getTenantUserIds(admin: ReturnType<typeof createClient>, tenantId: string): Promise<string[]> {
  const { data } = await admin.from("profiles").select("user_id").eq("tenant_id", tenantId);
  return (data || []).map((p: { user_id: string }) => p.user_id);
}

async function backupTable(
  admin: ReturnType<typeof createClient>,
  table: string,
  tenantId: string,
  userIds: string[],
): Promise<{ table: string; rows: unknown[]; count: number }> {
  try {
    let query = admin.from(table).select("*");

    if (USER_SCOPED_TABLES.has(table)) {
      if (userIds.length === 0) return { table, rows: [], count: 0 };
      query = query.in("user_id", userIds);
    } else if (!NON_TENANT_TABLES.has(table)) {
      query = query.eq("tenant_id", tenantId);
    } else {
      // Skip tables that need special joins — they'll be empty
      return { table, rows: [], count: 0 };
    }

    const { data, error } = await query.limit(50000);
    if (error) {
      console.error(`Error backing up ${table}:`, error.message);
      return { table, rows: [], count: 0 };
    }
    return { table, rows: data || [], count: (data || []).length };
  } catch (e) {
    console.error(`Exception backing up ${table}:`, e);
    return { table, rows: [], count: 0 };
  }
}

async function getStorageFiles(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
): Promise<Record<string, string[]>> {
  const buckets = ["meter-photos", "tenant-assets", "floor-plans", "floor-3d-models"];
  const result: Record<string, string[]> = {};

  for (const bucket of buckets) {
    try {
      const { data } = await admin.storage.from(bucket).list(tenantId, { limit: 1000 });
      result[bucket] = (data || []).map((f: { name: string }) => `${tenantId}/${f.name}`);
    } catch {
      result[bucket] = [];
    }
  }
  return result;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const { action = "export" } = await req.json().catch(() => ({}));

    // Create authenticated client to verify user, service client for data access
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Get user's tenant
    const { data: profile } = await admin.from("profiles").select("tenant_id").eq("user_id", user.id).single();
    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "No tenant found" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await admin.from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin", "super_admin"]);
    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const tenantId = profile.tenant_id;

    // --- LIST action ---
    if (action === "list") {
      const { data: snapshots } = await admin
        .from("backup_snapshots")
        .select("id, created_at, created_by, backup_type, status, tables_count, rows_count, size_bytes, expires_at, error_message")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50);

      return new Response(JSON.stringify({ snapshots: snapshots || [] }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // --- DELETE action ---
    if (action === "delete") {
      const { snapshot_id } = await req.json().catch(() => ({}));
      if (!snapshot_id) {
        // Already parsed above, re-parse won't work — get from URL or initial parse
      }
      // We need snapshot_id from the original body parse
      return new Response(JSON.stringify({ error: "Use DELETE with snapshot_id" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // --- EXPORT or SNAPSHOT ---
    const userIds = await getTenantUserIds(admin, tenantId);

    const allTables = Object.values(BACKUP_TABLES).flat();
    const results = await Promise.all(
      allTables.map((t) => backupTable(admin, t, tenantId, userIds)),
    );

    const storageFiles = await getStorageFiles(admin, tenantId);

    let totalRows = 0;
    let tablesWithData = 0;
    const backupData: Record<string, unknown[]> = {};

    for (const r of results) {
      if (r.count > 0) {
        backupData[r.table] = r.rows;
        tablesWithData++;
        totalRows += r.count;
      }
    }

    const backup = {
      version: "1.0",
      created_at: new Date().toISOString(),
      tenant_id: tenantId,
      tables: backupData,
      storage_files: storageFiles,
      metadata: {
        tables_count: tablesWithData,
        rows_count: totalRows,
        tables_empty: allTables.length - tablesWithData,
      },
    };

    const jsonStr = JSON.stringify(backup);
    const sizeBytes = new TextEncoder().encode(jsonStr).length;

    if (action === "snapshot") {
      const { error: insertError } = await admin.from("backup_snapshots").insert({
        tenant_id: tenantId,
        created_by: user.id,
        backup_type: "manual",
        status: "completed",
        tables_count: tablesWithData,
        rows_count: totalRows,
        size_bytes: sizeBytes,
        data: backup,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500, headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        tables_count: tablesWithData,
        rows_count: totalRows,
        size_bytes: sizeBytes,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Default: export as download
    return new Response(jsonStr, {
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="backup-${tenantId}-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    console.error("tenant-backup error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
