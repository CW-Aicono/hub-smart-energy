# Geplante Einrichtungsphase für neue Tenants

## Ziel
Neue Tenants können vom Portal-Admin bzw. vom zuständigen Partner-Admin vollständig eingerichtet werden (Liegenschaften, Ladestationen, Integrationen, Zähler), **bevor** der Tenant-Admin existiert oder Remote-Support freigibt. Kein Umgehen der Remote-Support-Zustimmung: Die Einrichtung ist ein eigener, sichtbarer, protokollierter und zeitlich begrenzter Vorgang, der mit der Übergabe an den Kunden endet.

## Ablauf
```text
Tenant anlegen ──> Status "In Einrichtung"
                     │  Button "Einrichtung öffnen" (Portal-Admin / eigener Partner-Admin)
                     │  Banner "Einrichtungsmodus – Tenant XY", jede Sitzung protokolliert
                     ▼
               "An Kunden übergeben" (manuell)  ODER  erste Anmeldung des Tenant-Admins
                     ▼
               Status "Aktiv" ──> ab jetzt nur noch Remote-Support mit Kundenfreigabe
```

- Beim Anlegen steht jeder neue Tenant automatisch auf „In Einrichtung“.
- In der Tenant-Detailseite (AICONO Portal und Partner-Portal) erscheint statt des gesperrten Remote-Support-Knopfs „Einrichtung öffnen“, solange der Status „In Einrichtung“ ist.
- Die Sitzung sieht aus wie Remote-Support (gleicher Banner, gleiches „Beenden“), ist aber als **Einrichtungssitzung** gekennzeichnet und wird nicht als Support-Zeit abgerechnet.
- Übergabe: Knopf „Einrichtung abschließen & übergeben“ oder automatisch bei der ersten Anmeldung eines echten Tenant-Admins. Offene Einrichtungssitzungen werden dann beendet.
- Bestehende Tenants werden als „Aktiv“ geführt – für sie ändert sich nichts.
- Eine Rückkehr in „In Einrichtung“ ist nicht vorgesehen (sonst wäre es wieder eine Hintertür).

## Technische Details
- Migration (idempotent): `tenants.setup_status text not null default 'active' check in ('setup','active')`, `setup_completed_at timestamptz`, `setup_completed_by uuid`; Bestand = `active`. `support_sessions.session_kind text default 'support' check in ('support','setup')`.
- RPC `complete_tenant_setup(_tenant_id)` (SECURITY DEFINER; erlaubt für Portal-Admin oder `partner_has_tenant_access`) setzt `active`, beendet offene Setup-Sitzungen, Audit-Log.
- Trigger/Login-Hook: erste Anmeldung eines Nicht-Support-Users mit Rolle `admin` im Tenant → `complete_tenant_setup`.
- Tenant-Anlage (Portal + Partner) setzt `setup_status='setup'`.
- Edge Function `support-session-impersonate`: Parameter `kind`. `setup` nur erlaubt, wenn `setup_status='setup'`; sonst weiterhin Pflicht `remote_support_enabled`. Gleiche Rollenprüfung (Portal-Admin oder Partner-Admin des Tenants), `session_kind` wird gespeichert.
- Abrechnung: `generate-monthly-invoices`/Support-Zeiten filtern `session_kind='support'`.
- UI: `SuperAdminTenantDetail.tsx`, `PartnerTenantDetail.tsx` (Status-Badge, Knöpfe), `SupportSessionBanner` (Text je Art), `RemoteSupportHistory` (Art anzeigen), Tenant-Listen Badge „In Einrichtung“.
- Tests: Edge-Logik (setup erlaubt nur im Status setup, danach 403 ohne Freigabe), Abrechnung ignoriert Setup-Sitzungen.
- Handbuch (4 Sprachen), Release Notes, CHANGELOG, SemVer MINOR, Roadmap-Board.
