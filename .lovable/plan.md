# Tenant-Transfer (Partner ↔ Partner ↔ Super-Admin)

## Ziel
Super-Admin kann einen Tenant von einem Partner auf einen anderen Partner übertragen — oder in die direkte Super-Admin-Verwaltung („Platform") zurückholen. Vorgang inkl. Audit-Log, Wechsel des Remote-Support-Zugriffs und optionaler Benachrichtigung.

## Scope
- Nur Super-Admin darf transferieren (keine Partner-Selbstbedienung).
- Betroffene Felder auf `tenants`: `partner_id` (kann NULL = Platform), `support_owner` (`partner` | `platform`).
- Historische Zuordnung wird in einem neuen Audit-Table protokolliert.

## Umsetzung

### 1. Datenmodell
Neue Tabelle `tenant_partner_transfers` (Audit/Historie):
- `tenant_id`, `from_partner_id` (nullable), `to_partner_id` (nullable), `from_support_owner`, `to_support_owner`, `reason` (text), `performed_by` (auth user), `created_at`.
- RLS: nur `super_admin` darf SELECT/INSERT; `service_role` all.

### 2. Edge Function `super-admin-transfer-tenant`
Input: `{ tenant_id, target_partner_id | null, reason }`
Ablauf:
1. JWT prüfen, `has_role(user, 'super_admin')` erzwingen.
2. Alten `partner_id` / `support_owner` lesen.
3. `tenants` updaten:
   - `partner_id = target_partner_id` (oder NULL)
   - `support_owner = target_partner_id ? 'partner' : 'platform'`
4. Zeile in `tenant_partner_transfers` schreiben.
5. `audit_logs` Eintrag (`action = 'tenant.partner_transfer'`).
6. Ergebnis zurückgeben.

Kein Löschen von Daten des Tenants; nur Ownership-Wechsel. Bestehende Partner-Members verlieren dadurch automatisch Zugriff (RLS läuft über `tenants.partner_id`).

### 3. UI im Super-Admin
Auf der Super-Admin Tenant-Detailseite (bzw. Tenants-Liste, Zeilen-Aktion) neuer Button „Partner wechseln":
- Dialog mit:
  - Aktueller Partner (readonly).
  - Ziel: Dropdown aller aktiven Partner + Option „Direkt Super-Admin (Platform)".
  - Grund (Pflicht-Textfeld, min. 5 Zeichen).
  - Warnhinweis: alter Partner verliert sofort Zugriff & Remote-Support.
- Bestätigen ruft die Edge Function auf, invalidiert Tenant-Queries.

### 4. Historie-Ansicht
Im Tenant-Detail (Super-Admin) neuer Abschnitt „Partner-Historie": Liste aller Einträge aus `tenant_partner_transfers` (Von → Nach, Grund, Datum, Ausführender).

### 5. Nicht enthalten (bewusst)
- Kein Zustimmungs-Workflow des neuen Partners (Super-Admin-Aktion).
- Kein automatisches E-Mail-Versenden (kann in Folge-Story ergänzt werden).
- Partner-Selfservice („Tenant abgeben") ausdrücklich ausgeschlossen.

## Betroffene Dateien (geplant)
- Migration: neue Tabelle `tenant_partner_transfers` + RLS + GRANTs.
- Neu: `supabase/functions/super-admin-transfer-tenant/index.ts`.
- Neu: `src/components/super-admin/TransferTenantDialog.tsx`.
- Neu: `src/components/super-admin/TenantPartnerHistory.tsx`.
- Edit: Super-Admin Tenant-Detail/Listen-Seite (Aktion einbinden).
