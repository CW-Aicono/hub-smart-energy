import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

/**
 * Check whether an email address can be used for a new invitation.
 *
 * Body: { email: string, intent: "tenant_invite" | "super_admin_invite", tenantId?: string }
 *
 * Response: {
 *   status:
 *     | "available"
 *     | "exists_same_tenant"        // user is already in the calling tenant (with role)
 *     | "blocked_other_tenant"      // user belongs to a different tenant
 *     | "blocked_super_admin"       // user is a super admin (cannot be invited as tenant user)
 *     | "blocked_tenant_user",      // user is a tenant user (cannot be invited as super admin)
 *   message: string,                // user-facing German message
 *   currentRole?: string,           // for exists_same_tenant
 *   otherTenantName?: string,       // for blocked_other_tenant, ONLY for super_admin callers
 * }
 *
 * Auth: requires admin or super_admin caller.
 */

type Intent = "tenant_invite" | "super_admin_invite";

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Auth: require admin or super_admin ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Not authenticated" }, 401, corsHeaders);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) {
      return json({ error: "Not authenticated" }, 401, corsHeaders);
    }

    const { data: callerRolesRaw } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const callerRoles = (callerRolesRaw || []).map((r: { role: string }) => r.role);
    const callerIsSuper = callerRoles.includes("super_admin");
    const callerIsAdmin = callerRoles.includes("admin");
    if (!callerIsSuper && !callerIsAdmin) {
      return json({ error: "Insufficient permissions" }, 403, corsHeaders);
    }

    // Resolve caller tenant (for context)
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", caller.id)
      .maybeSingle();
    const callerTenantId = callerProfile?.tenant_id ?? null;

    // ── Input ──
    const body = await req.json().catch(() => ({}));
    const email: string | undefined = body?.email?.toString().trim().toLowerCase();
    const intent: Intent = body?.intent === "super_admin_invite" ? "super_admin_invite" : "tenant_invite";
    const tenantId: string | null = body?.tenantId ?? callerTenantId ?? null;

    if (!email || !email.includes("@")) {
      return json({ error: "Invalid email" }, 400, corsHeaders);
    }

    // Only super_admins may invite super_admins
    if (intent === "super_admin_invite" && !callerIsSuper) {
      return json({ error: "Only super admins can invite platform users" }, 403, corsHeaders);
    }

    // ── Look up existing user in auth.users ──
    // listUsers is paginated; we scan up to 5 pages of 1000 = 5000 users.
    // Safe enough for this app size; can be replaced by an indexed view later.
    let existingUser:
      | { id: string; email: string | null | undefined }
      | null = null;
    for (let page = 1; page <= 5; page++) {
      const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (listErr) {
        console.error("[check-email-availability] listUsers error", listErr);
        return json({ error: "Lookup failed" }, 500, corsHeaders);
      }
      const found = list?.users?.find((u) => u.email?.toLowerCase() === email);
      if (found) {
        existingUser = { id: found.id, email: found.email };
        break;
      }
      if (!list?.users || list.users.length < 1000) break;
    }

    if (!existingUser) {
      return json(
        { status: "available", message: "E-Mail-Adresse ist verfügbar." },
        200,
        corsHeaders,
      );
    }

    // Existing user → look up profile + roles
    const [{ data: targetProfile }, { data: targetRolesRaw }] = await Promise.all([
      supabase.from("profiles").select("tenant_id").eq("user_id", existingUser.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", existingUser.id),
    ]);
    const targetTenantId: string | null = targetProfile?.tenant_id ?? null;
    const targetRoles = (targetRolesRaw || []).map((r: { role: string }) => r.role);
    const isSuperAdmin = targetRoles.includes("super_admin");
    const currentRole = targetRoles[0] ?? "user";

    // ── Decision matrix ──

    // Case A: invitation as super admin
    if (intent === "super_admin_invite") {
      if (isSuperAdmin) {
        return json(
          {
            status: "exists_same_tenant",
            currentRole: "super_admin",
            message: "Diese E-Mail ist bereits als Plattform-Administrator (Super-Admin) registriert.",
          },
          200,
          corsHeaders,
        );
      }
      if (targetTenantId) {
        // User already belongs to a tenant – cannot be promoted to super_admin via invite flow
        let otherTenantName: string | undefined;
        if (callerIsSuper) {
          const { data: t } = await supabase.from("tenants").select("name").eq("id", targetTenantId).maybeSingle();
          otherTenantName = t?.name ?? undefined;
        }
        return json(
          {
            status: "blocked_tenant_user",
            otherTenantName,
            message: otherTenantName
              ? `Diese E-Mail ist bereits Tenant-Nutzer der Organisation „${otherTenantName}“. Plattform-Rolle kann nicht vergeben werden.`
              : "Diese E-Mail ist bereits ein Tenant-Nutzer. Plattform-Rolle kann nicht vergeben werden.",
          },
          200,
          corsHeaders,
        );
      }
      // No tenant, no super_admin – treat as available (orphaned account, can be promoted)
      return json(
        {
          status: "available",
          message: "E-Mail existiert ohne Zuordnung und kann verwendet werden.",
        },
        200,
        corsHeaders,
      );
    }

    // Case B: invitation as tenant user/admin
    if (isSuperAdmin) {
      return json(
        {
          status: "blocked_super_admin",
          message: "Diese E-Mail gehört zu einem Plattform-Konto (Super-Admin) und kann nicht als Tenant-Nutzer eingeladen werden.",
        },
        200,
        corsHeaders,
      );
    }
    if (targetTenantId && tenantId && targetTenantId === tenantId) {
      return json(
        {
          status: "exists_same_tenant",
          currentRole,
          message: `Nutzer existiert bereits in dieser Organisation (Rolle: ${roleLabel(currentRole)}). Bitte vorhandenen Nutzer bearbeiten.`,
        },
        200,
        corsHeaders,
      );
    }
    if (targetTenantId && targetTenantId !== tenantId) {
      let otherTenantName: string | undefined;
      if (callerIsSuper) {
        const { data: t } = await supabase.from("tenants").select("name").eq("id", targetTenantId).maybeSingle();
        otherTenantName = t?.name ?? undefined;
      }
      return json(
        {
          status: "blocked_other_tenant",
          otherTenantName,
          message: callerIsSuper && otherTenantName
            ? `Diese E-Mail wird bereits in einer anderen Organisation („${otherTenantName}“) verwendet.`
            : "Diese E-Mail wird bereits in einer anderen Organisation verwendet.",
        },
        200,
        corsHeaders,
      );
    }

    // No tenant, no super_admin: orphan account → ok to claim
    return json(
      {
        status: "available",
        message: "E-Mail existiert ohne Tenant-Zuordnung und kann verwendet werden.",
      },
      200,
      corsHeaders,
    );
  } catch (err) {
    console.error("[check-email-availability] error", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500, getCorsHeaders(req));
  }
};

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function roleLabel(role: string): string {
  switch (role) {
    case "admin": return "Administrator";
    case "super_admin": return "Super-Admin";
    case "sales_partner": return "Vertriebspartner";
    case "user": return "Benutzer";
    default: return role;
  }
}

serve(handler);
