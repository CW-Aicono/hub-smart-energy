## A4 – Systemweites Audit-Log

### Ist-Zustand (verifiziert)

- `user_role_audit_log` existiert (nur Rollenänderungen, via Trigger).
- `email_send_audit` existiert (nur E-Mail-Versand).
- `task_history` existiert (nur Tasks).
- **Keine** generische `audit_logs`-Tabelle; Modul-Toggles, Tenant-Sperren, Preisänderungen, Member-Removals sind nicht nachvollziehbar.

### Plan

**1. Migration – Tabelle `audit_logs**`
Felder:

- `id`, `created_at`
- `actor_user_id` (uuid, nullable für Backend-Jobs), `actor_email` (text), `actor_role` (text)
- `tenant_id` (uuid, nullable – für Super-Admin-Aktionen ohne Tenant)
- `partner_id` (uuid, nullable)
- `action` (text, z.B. `tenant.suspend`, `module.toggle`, `pricing.update`, `member.remove`, `partner.update`, `license.change`)
- `entity_type` (text, z.B. `tenant`, `module`, `partner`, `member`, `license`)
- `entity_id` (uuid, nullable), `entity_label` (text – lesbarer Name für UI)
- `before` (jsonb), `after` (jsonb), `metadata` (jsonb)
- `ip_address` (inet), `user_agent` (text)

GRANTs: `SELECT, INSERT` → `authenticated`; `ALL` → `service_role`. Kein anon.

RLS:

- Super-Admin: alles lesen.
- Tenant-Admin: nur Einträge mit eigener `tenant_id` lesen.
- Partner-Admin: nur Einträge mit eigener `partner_id` oder Tenants des Partners lesen (via `is_partner_member`).
- INSERT nur via Edge-Function (service_role) – kein direkter Insert aus dem Frontend.

Indizes: `(tenant_id, created_at DESC)`, `(partner_id, created_at DESC)`, `(action, created_at DESC)`, `(entity_type, entity_id)`.

Retention-Job (cron, monatlich): Einträge > 365 Tage löschen.

**2. Edge-Function `audit-log-write**`

- POST, `verify_jwt = true` (Standard) – validiert User-Session via `authClient`.
- Body (Zod): `{ action, entity_type, entity_id?, entity_label?, tenant_id?, partner_id?, before?, after?, metadata? }`
- Ermittelt `actor_user_id`, `actor_email`, `actor_role`, `ip_address` (x-forwarded-for), `user_agent` aus Request serverseitig (nicht aus Body, gegen Spoofing).
- Schreibt mit `SUPABASE_SERVICE_ROLE_KEY`.
- Rate-Limit: 60 Inserts/min pro `actor_user_id`.
- CORS via `getCorsHeaders(req)`.

**3. Client-Helper `src/lib/auditLog.ts**`

- `writeAuditLog(payload)` ruft `supabase.functions.invoke('audit-log-write', ...)`.
- Fire-and-forget mit `try/catch` (Audit-Failure darf User-Aktion nicht blocken), Fehler in `console.warn`.

**4. Aufrufe in kritischen `onSuccess`-Callbacks**

- `SuperAdminTenants.tsx` / `SuperAdminTenantDetail.tsx`: Tenant suspend / reactivate / delete → `action: 'tenant.status_change'` mit `before/after = { status }`.
- `SuperAdminModulePricing.tsx` & `SuperAdminBundles.tsx`: Preisänderungen → `pricing.update` / `bundle.update`.
- Tenant-Modul-Toggle (überall wo `tenant_modules.is_enabled` mutiert wird – Module-Management Card): `module.toggle`.
- `SuperAdminPartners.tsx`: Partner-Erstellung/-Update/-Branding → `partner.update`.
- Member-Removal (Partner-Members, Sharing-Members): `member.remove`.
- License-Änderungen (`tenant_licenses`): `license.change`.

Suche im Code nach den relevanten Mutations (`useMutation` mit Update auf diese Tabellen) und ergänze jeweils `onSuccess` um `writeAuditLog(...)`.

**5. UI – Tab „Aktivitätslog"**

- Neue Komponente `src/components/audit/AuditLogList.tsx`:
  - Props: `{ tenantId?: string; partnerId?: string; limit?: number }`
  - Hook `useAuditLogs({ tenantId, partnerId })` – React-Query, `staleTime: 30_000`.
  - Tabelle: Zeitstempel (de-DE), Actor (Email+Rolle), Aktion (i18n-Label), Entity, Diff-Button (Dialog mit before/after JSON), Filter: Aktion, Zeitraum (7/30/90 Tage).
- Einbau:
  - `SuperAdminTenantDetail.tsx` → neuer Tab „Aktivitätslog".
  - `SuperAdminPartners.tsx` Edit-Dialog → neuer Tab „Aktivitätslog" (zusätzlich zu Billing/Branding aus X2).

**6. i18n**
DE/EN/ES/NL – Aktionscodes → lesbare Labels (`audit.action.tenant.suspend` etc.) in allen 4 Sprachen.

### Geänderte/neue Dateien

- 1 Migration (Tabelle + RLS + Indizes + Retention-Funktion + Cron)
- `supabase/functions/audit-log-write/index.ts` (neu)
- `src/lib/auditLog.ts` (neu)
- `src/hooks/useAuditLogs.tsx` (neu)
- `src/components/audit/AuditLogList.tsx` (neu)
- `src/pages/SuperAdminTenantDetail.tsx`, `SuperAdminPartners.tsx`, `SuperAdminTenants.tsx`, `SuperAdminModulePricing.tsx`, `SuperAdminBundles.tsx` und Module-Toggle-Komponenten (jeweils nur `onSuccess`-Erweiterung)
- `src/i18n/translations.ts`

### Offene Frage

Retention 365 Tage ok, oder anderer Zeitraum gewünscht (z.B. 2 Jahre für Compliance)?  
Antwort: Du entscheidest: was ist für Compliance besser?