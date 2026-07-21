/**
 * Support-View Helper (Impersonation-basiert)
 * ===========================================
 * Wenn ein Super-Admin "Remote-Support" startet, tauscht das Frontend die
 * eigene Supabase-Session gegen die Session eines technischen Support-Users
 * des Ziel-Tenants. Die Original-Session wird hier zwischengespeichert,
 * damit beim Beenden zurückgewechselt werden kann.
 *
 * Es gibt KEINE Override-Logik mehr auf tenant_id-Ebene – auth.uid() ist
 * während der Sitzung tatsächlich der Tenant-Support-User. Damit verhalten
 * sich alle RLS-Policies, RPCs, Widgets, Preferences usw. identisch zur
 * Sicht eines echten Tenant-Admins.
 */

const KEY_ORIGINAL = "support_original_session";
const KEY_SESSION_ID = "support_active_session_id";
const KEY_TENANT_ID = "support_active_tenant_id";
const EVENT_NAME = "support-impersonation-changed";

interface OriginalSession {
  access_token: string;
  refresh_token: string;
}

export function isImpersonating(): boolean {
  try {
    return !!sessionStorage.getItem(KEY_ORIGINAL) && !!sessionStorage.getItem(KEY_SESSION_ID);
  } catch {
    return false;
  }
}

export function getActiveSupportSessionId(): string | null {
  try { return sessionStorage.getItem(KEY_SESSION_ID); } catch { return null; }
}

export function getActiveSupportTenantId(): string | null {
  try { return sessionStorage.getItem(KEY_TENANT_ID); } catch { return null; }
}

export function getOriginalSession(): OriginalSession | null {
  try {
    const raw = sessionStorage.getItem(KEY_ORIGINAL);
    return raw ? (JSON.parse(raw) as OriginalSession) : null;
  } catch {
    return null;
  }
}

export function beginImpersonation(opts: {
  sessionId: string;
  tenantId: string;
  originalSession: OriginalSession;
}) {
  try {
    sessionStorage.setItem(KEY_ORIGINAL, JSON.stringify(opts.originalSession));
    sessionStorage.setItem(KEY_SESSION_ID, opts.sessionId);
    sessionStorage.setItem(KEY_TENANT_ID, opts.tenantId);
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch { /* noop */ }
}

export function clearImpersonation() {
  try {
    sessionStorage.removeItem(KEY_ORIGINAL);
    sessionStorage.removeItem(KEY_SESSION_ID);
    sessionStorage.removeItem(KEY_TENANT_ID);
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch { /* noop */ }
}

/**
 * Beendet eine laufende Support-Sitzung sauber:
 * 1) markiert die Session serverseitig als beendet,
 * 2) stellt die Original-Session des Super-Admins wieder her (oder loggt aus),
 * 3) räumt Impersonations-Flags auf,
 * 4) macht einen HARTEN Redirect ins Super-Admin, damit Tenant-Context,
 *    React-Query-Caches und Realtime-Kanäle komplett neu aufgebaut werden.
 */
export async function endImpersonationAndReturn(
  supabase: {
    functions: { invoke: (name: string, opts?: any) => Promise<any> };
    auth: {
      setSession: (s: { access_token: string; refresh_token: string }) => Promise<any>;
      signOut: () => Promise<any>;
    };
  },
  opts: { sessionId?: string | null; tenantId?: string | null } = {},
): Promise<void> {
  const sessionId = opts.sessionId ?? getActiveSupportSessionId();
  const tenantId = opts.tenantId ?? getActiveSupportTenantId();

  try {
    if (sessionId) {
      await supabase.functions.invoke("support-session-end", {
        body: { session_id: sessionId },
      });
    }
  } catch (e) {
    console.error("support-session-end failed", e);
  }

  const orig = getOriginalSession();
  try {
    if (orig?.access_token && orig?.refresh_token) {
      await supabase.auth.setSession({
        access_token: orig.access_token,
        refresh_token: orig.refresh_token,
      });
    } else {
      await supabase.auth.signOut();
    }
  } catch (e) {
    console.error("restore original session failed", e);
    try { await supabase.auth.signOut(); } catch { /* noop */ }
  }

  clearImpersonation();

  const target = tenantId ? `/super-admin/tenants/${tenantId}` : "/super-admin/tenants";
  window.location.replace(target);
}

export function onImpersonationChanged(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

