/**
 * useTenantQuery
 *
 * Central hook that returns a tenant-scoped query builder factory and
 * a typed insert helper. Every hook that reads/writes tenant data should
 * use these helpers instead of manually repeating `.eq("tenant_id", …)`.
 *
 * Usage (read):
 *   const { from, tenantId, ready } = useTenantQuery();
 *   const rows = await from("meters").select("*").order("name");
 *
 * Usage (insert):
 *   const { insert } = useTenantQuery();
 *   await insert("meters", { name: "Main", … });
 *
 * If tenantId is not yet available, `ready` is false and `from` / `insert`
 * are no-ops that resolve with an empty / error result so callers don't need
 * extra null-guards.
 */

import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import type { Database } from "@/integrations/supabase/types";

type PublicTables = Database["public"]["Tables"];
type TableName = keyof PublicTables;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a Supabase query builder pre-filtered to the current tenant.
 * The builder is exactly like calling `supabase.from(table)` but with
 * `.eq("tenant_id", tenantId)` already applied on SELECT queries.
 *
 * Note: INSERT / UPDATE / DELETE do NOT auto-inject tenant_id here –
 * use `insert()` for that, and always provide tenant_id on updates if needed.
 */
function createTenantFrom(tenantId: string) {
  return function from<T extends TableName>(table: T) {
    // Return a select query builder pre-filtered by tenant_id.
    // We must call .select("*") first to get a PostgrestFilterBuilder
    // before we can chain .eq().
    return (supabase.from(table) as any).select("*").eq("tenant_id", tenantId);
  };
}

/**
 * Inserts a row into `table`, automatically injecting the current tenant_id.
 */
function createTenantInsert(tenantId: string) {
  return async function insert<T extends TableName>(
    table: T,
    data: Omit<PublicTables[T]["Insert"], "tenant_id"> & Record<string, unknown>,
  ) {
    return (supabase.from(table) as any).insert({ ...data, tenant_id: tenantId });
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseTenantQueryReturn {
  /** The current tenant's UUID. Null if tenant hasn't loaded yet. */
  tenantId: string | null;
  /** True once the tenant is available and queries can be executed. */
  ready: boolean;
  /**
   * Returns a Supabase query builder for `table` pre-filtered by tenant_id.
   * Throws if called before `ready === true`.
   */
  from: ReturnType<typeof createTenantFrom>;
  /**
   * Inserts a record into `table`, injecting tenant_id automatically.
   * Returns the standard Supabase PostgrestFilterBuilder.
   */
  insert: ReturnType<typeof createTenantInsert>;
}

export function useTenantQuery(): UseTenantQueryReturn {
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? null;
  const ready = tenantId !== null;

  // Stable memoized helpers – recreated only when tenantId changes.
  const from = useCallback(
    (table: TableName) => {
      if (!tenantId) {
        // Return a builder that will immediately fail gracefully.
        return (supabase.from(table) as any).eq("tenant_id", "00000000-0000-0000-0000-000000000000");
      }
      return createTenantFrom(tenantId)(table);
    },
    [tenantId],
  ) as ReturnType<typeof createTenantFrom>;

  const insert = useCallback(
    async (table: TableName, data: Record<string, unknown>) => {
      if (!tenantId) {
        return { data: null, error: new Error("Tenant not loaded") };
      }
      return createTenantInsert(tenantId)(table, data as any);
    },
    [tenantId],
  ) as ReturnType<typeof createTenantInsert>;

  return { tenantId, ready, from, insert };
}
