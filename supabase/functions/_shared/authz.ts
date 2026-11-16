// Shared server-side authorization helpers for edge functions.
// Never trust tenant ids, roles or JWT claims supplied by the client: resolve
// the caller from a verified token and check tenant ownership against the DB.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isInternalCaller } from "./internalAuth.ts";

export interface Caller {
  internal: boolean;
  userId: string | null;
  email: string | null;
  tenantId: string | null;
  roles: string[];
  partnerIds: string[];
}

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolves the caller (internal service key or verified user). Returns null when unauthenticated. */
export async function resolveCaller(req: Request, svc: SupabaseClient = serviceClient()): Promise<Caller | null> {
  if (isInternalCaller(req)) {
    return { internal: true, userId: null, email: null, tenantId: null, roles: ["service_role"], partnerIds: [] };
  }
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await svc.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return null;
  const [{ data: profile }, { data: roles }, { data: partners }] = await Promise.all([
    svc.from("profiles").select("tenant_id").eq("user_id", user.id).maybeSingle(),
    svc.from("user_roles").select("role").eq("user_id", user.id),
    svc.from("partner_members").select("partner_id").eq("user_id", user.id),
  ]);
  return {
    internal: false,
    userId: user.id,
    email: user.email ?? null,
    tenantId: (profile as any)?.tenant_id ?? null,
    roles: (roles ?? []).map((r: any) => r.role),
    partnerIds: (partners ?? []).map((p: any) => p.partner_id),
  };
}

export const isSuperAdmin = (c: Caller) => c.internal || c.roles.includes("super_admin");
export const isAdminRole = (c: Caller) => c.internal || c.roles.includes("admin") || c.roles.includes("super_admin");

/** True when the caller may act on the given tenant (own tenant, partner-managed tenant or portal admin). */
export async function canAccessTenant(svc: SupabaseClient, c: Caller, tenantId: string | null | undefined): Promise<boolean> {
  if (!tenantId) return isSuperAdmin(c);
  if (isSuperAdmin(c)) return true;
  if (c.tenantId && c.tenantId === tenantId) return true;
  if (c.partnerIds.length) {
    const { data } = await svc.from("tenants").select("partner_id").eq("id", tenantId).maybeSingle();
    if ((data as any)?.partner_id && c.partnerIds.includes((data as any).partner_id)) return true;
  }
  return false;
}

/** Tenant access plus an admin role (tenant admin of that tenant, partner admin of it, or portal admin). */
export async function canAdminTenant(svc: SupabaseClient, c: Caller, tenantId: string | null | undefined): Promise<boolean> {
  if (isSuperAdmin(c)) return true;
  if (!tenantId) return false;
  if (c.tenantId === tenantId) return c.roles.includes("admin");
  if (c.partnerIds.length && (c.roles.includes("partner_admin") || c.roles.includes("sales_partner") || c.roles.includes("partner_user") || c.roles.includes("admin"))) {
    return canAccessTenant(svc, c, tenantId);
  }
  return false;
}

export function jsonResponse(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

/** Escapes untrusted text for HTML email bodies. */
export function escapeHtml(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

/** Checks sales project access with the caller's own JWT (DB function uses auth.uid()). */
export async function canAccessSalesProject(req: Request, projectId: string): Promise<boolean> {
  if (isInternalCaller(req)) return true;
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !projectId) return false;
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.rpc("can_access_sales_project", { _project_id: projectId });
  return !error && data === true;
}
