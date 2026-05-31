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

export function onImpersonationChanged(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

// ---- Backward-compat Aliases (werden in Phase 3 entfernt) ----
// Bestehende Aufrufer auf getSupportViewTenantId/SessionId etc. werden
// schrittweise umgestellt; bis dahin liefern wir die aktiven Werte zurück.
export const getSupportViewTenantId = getActiveSupportTenantId;
export const getSupportViewSessionId = getActiveSupportSessionId;
export const onSupportViewChanged = onImpersonationChanged;
export function enterSupportView(_tenantId: string, _sessionId: string) {
  // Veraltete API – Impersonation läuft jetzt über beginImpersonation().
  // Bewusst No-Op, damit alte Aufrufe keine Inkonsistenz erzeugen.
}
export function exitSupportView() {
  clearImpersonation();
}
