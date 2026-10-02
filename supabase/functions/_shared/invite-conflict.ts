// Shared invite-conflict checker.
// Enforces the "email is unique system-wide" rule before any auth.users mutation.
// Blocks creating/reusing an account that would give one email address multiple
// separate contexts (tenant user, partner member, super_admin), because those
// contexts lead to login-routing conflicts.

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any;

export type InviteIntent = "tenant_invite" | "super_admin_invite" | "partner_invite";

export interface InviteConflictArgs {
  supabase: SupabaseAdmin;
  email: string;
  intent: InviteIntent;
  tenantId?: string | null;
  /** For intent="partner_invite": the target partner id. */
  partnerId?: string | null;
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

async function findAuthUserByEmail(supabase: SupabaseAdmin, email: string) {
  for (let page = 1; page <= 5; page++) {
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (listErr) return { error: "Benutzer-Lookup fehlgeschlagen." as const };
    const found = list?.users?.find((u: { email?: string | null }) => u.email?.toLowerCase() === email);
    if (found) return { user: { id: found.id as string, email: (found.email as string | null) ?? null } };
    if (!list?.users || list.users.length < 1000) break;
  }
  return { user: null };
}

/**
 * Look up the email across auth.users + partner_members + user_roles + profiles
 * and decide whether the invite may proceed. Returns { ok: true, existingUserId? }
 * on success, or { ok: false, error } if the invite must be blocked.
 */
export async function checkInviteConflict(args: InviteConflictArgs): Promise<InviteConflictResult> {
  const { supabase, intent, tenantId, partnerId, force, callerIsSuper } = args;
  const email = args.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Ungültige E-Mail-Adresse.", status: 400 };
  }

  const lookup = await findAuthUserByEmail(supabase, email);
  if ("error" in lookup) return { ok: false, error: lookup.error, status: 500 };
  const existingUser = lookup.user;

  if (!existingUser) return { ok: true };

  // Existing user → gather full context (tenant, roles, partner memberships)
  const [{ data: targetProfile }, { data: targetRolesRaw }, { data: partnerMemberships }] = await Promise.all([
    supabase.from("profiles").select("tenant_id").eq("user_id", existingUser.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", existingUser.id),
    supabase.from("partner_members").select("partner_id").eq("user_id", existingUser.id),
  ]);
  const targetTenantId: string | null = targetProfile?.tenant_id ?? null;
  const targetRoles = (targetRolesRaw || []).map((r: { role: string }) => r.role);
  const isSuperAdmin = targetRoles.includes("super_admin");
  const partnerIds: string[] = (partnerMemberships || []).map((p: { partner_id: string }) => p.partner_id);
  const isPartnerMember = partnerIds.length > 0;

  if (intent === "super_admin_invite") {
    if (isSuperAdmin) return { ok: true, existingUserId: existingUser.id };
    if (targetTenantId) {
      return {
        ok: false, status: 409,
        error: "Diese E-Mail ist bereits Tenant-Nutzer und kann nicht als Plattform-Administrator (Super-Admin) eingeladen werden. Bitte eine andere Adresse verwenden.",
      };
    }
    if (isPartnerMember) {
      return {
        ok: false, status: 409,
        error: "Diese E-Mail ist bereits im Partner-Portal registriert und kann nicht zusätzlich als Super-Admin eingeladen werden. Bitte eine andere Adresse verwenden.",
      };
    }
    return { ok: true, existingUserId: existingUser.id };
  }

  if (intent === "partner_invite") {
    if (isSuperAdmin) {
      return {
        ok: false, status: 409,
        error: "Diese E-Mail gehört zu einem Plattform-Konto (Super-Admin) und kann nicht als Partner-Mitglied eingeladen werden.",
      };
    }
    if (targetTenantId) {
      return {
        ok: false, status: 409,
        error: "Diese E-Mail wird bereits als Tenant-Nutzer verwendet und kann nicht zusätzlich als Partner-Mitglied eingeladen werden. Bitte eine andere Adresse wählen.",
      };
    }
    if (isPartnerMember && partnerId && !partnerIds.includes(partnerId)) {
      return {
        ok: false, status: 409,
        error: "Diese E-Mail ist bereits bei einem anderen Partner registriert. Bitte eine andere Adresse wählen.",
      };
    }
    // Same partner or orphan → reuse
    return { ok: true, existingUserId: existingUser.id };
  }

  // intent = tenant_invite
  if (isSuperAdmin) {
    return {
      ok: false, status: 409,
      error: "Diese E-Mail gehört zu einem Plattform-Konto (Super-Admin) und kann nicht als Tenant-Nutzer eingeladen werden.",
    };
  }
  if (isPartnerMember) {
    return {
      ok: false, status: 409,
      error: "Diese E-Mail ist bereits im Partner-Portal registriert und kann nicht zusätzlich als Tenant-Nutzer eingeladen werden. Bitte eine andere Adresse wählen.",
    };
  }
  if (targetTenantId && tenantId && targetTenantId === tenantId) {
    return { ok: true, existingUserId: existingUser.id };
  }
  if (targetTenantId && targetTenantId !== tenantId) {
    if (force && callerIsSuper) return { ok: true, existingUserId: existingUser.id };
    return {
      ok: false, status: 409,
      error: callerIsSuper
        ? "Diese E-Mail wird bereits in einer anderen Organisation verwendet. Mit ‚Trotzdem übernehmen' kann die Zuordnung explizit geändert werden."
        : "Diese E-Mail wird bereits in einer anderen Organisation verwendet. Bitte andere Adresse wählen.",
    };
  }

  return { ok: true, existingUserId: existingUser.id };
}
