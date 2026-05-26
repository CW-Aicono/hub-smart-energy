/**
 * Support-View Helper
 * ===================
 * Speichert in sessionStorage, ob ein Super-Admin gerade einen Tenant „live"
 * über Remote-Support beobachtet. `useTenant` liest diese Werte und liefert
 * dem gesamten Frontend dann den Ziel-Tenant statt des eigenen Tenants.
 */

const KEY_TENANT = "support_view_tenant_id";
const KEY_SESSION = "support_view_session_id";
const EVENT_NAME = "support-view-changed";

export function getSupportViewTenantId(): string | null {
  try {
    return sessionStorage.getItem(KEY_TENANT);
  } catch {
    return null;
  }
}

export function getSupportViewSessionId(): string | null {
  try {
    return sessionStorage.getItem(KEY_SESSION);
  } catch {
    return null;
  }
}

export function enterSupportView(tenantId: string, sessionId: string) {
  try {
    sessionStorage.setItem(KEY_TENANT, tenantId);
    sessionStorage.setItem(KEY_SESSION, sessionId);
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* noop */
  }
}

export function exitSupportView() {
  try {
    sessionStorage.removeItem(KEY_TENANT);
    sessionStorage.removeItem(KEY_SESSION);
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* noop */
  }
}

export function onSupportViewChanged(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
