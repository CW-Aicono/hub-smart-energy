// Shared invite-conflict checker.
// Used by activate-invited-user and invite-tenant-admin to enforce the
// "email is unique system-wide" rule before any auth.users mutation.

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any;

export type InviteIntent = "tenant_invite" | "super_admin_invite";

export interface InviteConflictArgs {
  supabase: SupabaseAdmin;
  email: string;
  intent: InviteIntent;
  tenantId: string | null;
  /** super_admin caller may pass force=true to override blocked_other_tenant. */
  force?: boolean;
  /** Whether the caller is a super_admin (controls force override). */
  callerIsSuper: boolean;
}

export interface InviteConflictResult {
  ok: boolean;
  /** When ok=false, an HTTP-friendly error message to send back. */
  error?: string;
  /** When ok=false, the suggested HTTP status code (400/409). */
  status?: number;
  /** When ok=true and an existing user was found, this is reused. */
  existingUserId?: string;
}

/**
 * Look up the email in auth.users and decide whether the invite may proceed.
 * Returns { ok: true, existingUserId? } on success. Returns { ok: false, error }
 * if the invite must be blocked.
 */
export async function checkInviteConflict(args: InviteConflictArgs): Promise<InviteConflictResult> {
  const { supabase, intent, tenantId, force, callerIsSuper } = args;
  const email = args.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Ungültige E-Mail-Adresse.", status: 400 };
  }

  // Look up existing user
  let existingUser: { id: string; email: string | null | undefined } | null = null;
  for (let page = 1; page <= 5; page++) {
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (listErr) {
      return { ok: false, error: "Benutzer-Lookup fehlgeschlagen.", status: 500 };
    }
    const found = list?.users?.find((u: { email?: string | null }) => u.email?.toLowerCase() === email);
    if (found) {
      existingUser = { id: found.id, email: found.email };
      break;
    }
    if (!list?.users || list.users.length < 1000) break;
  }

  if (!existingUser) {
    return { ok: true };
  }

  // Existing user → fetch profile + roles
  const [{ data: targetProfile }, { data: targetRolesRaw }] = await Promise.all([
    supabase.from("profiles").select("tenant_id").eq("user_id", existingUser.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", existingUser.id),
  ]);
  const targetTenantId: string | null = targetProfile?.tenant_id ?? null;
  const targetRoles = (targetRolesRaw || []).map((r: { role: string }) => r.role);
  const isSuperAdmin = targetRoles.includes("super_admin");

  if (intent === "super_admin_invite") {
    if (isSuperAdmin) {
      // Re-inviting an existing super admin – allow (e.g. resend invite mail)
      return { ok: true, existingUserId: existingUser.id };
    }
    if (targetTenantId) {
      return {
        ok: false,
        status: 409,
        error: "Diese E-Mail ist bereits Tenant-Nutzer und kann nicht als Plattform-Administrator (Super-Admin) eingeladen werden. Bitte eine andere Adresse verwenden.",
      };
    }
    return { ok: true, existingUserId: existingUser.id };
  }

  // intent = tenant_invite
  if (isSuperAdmin) {
    return {
      ok: false,
      status: 409,
      error: "Diese E-Mail gehört zu einem Plattform-Konto (Super-Admin) und kann nicht als Tenant-Nutzer eingeladen werden.",
    };
  }
  if (targetTenantId && tenantId && targetTenantId === tenantId) {
    // Same tenant → re-inviting an existing member is allowed (resend mail / role bump)
    return { ok: true, existingUserId: existingUser.id };
  }
  if (targetTenantId && targetTenantId !== tenantId) {
    if (force && callerIsSuper) {
      // Super admin explicitly takes the user over to a different tenant
      return { ok: true, existingUserId: existingUser.id };
    }
    return {
      ok: false,
      status: 409,
      error: callerIsSuper
        ? "Diese E-Mail wird bereits in einer anderen Organisation verwendet. Mit ‚Trotzdem übernehmen' kann die Zuordnung explizit geändert werden."
        : "Diese E-Mail wird bereits in einer anderen Organisation verwendet. Bitte andere Adresse wählen.",
    };
  }

  // Orphan (no tenant, no super_admin) → reuse
  return { ok: true, existingUserId: existingUser.id };
}
