## Ziel

Partner-Admins sollen in ihrem Partner-Portal (`/partner/members`) die volle Mitgliederverwaltung erhalten: Rollen + granulare Rechte zuweisen, Mitglieder bearbeiten und löschen. Der letzte verbleibende Partner-Admin darf nicht entfernt oder herabgestuft werden.

## Berechtigungsmodell

Heute existieren bereits 4 Boolean-Flags auf `partner_members`:
`can_manage_sales_catalog`, `can_create_tenant`, `can_view_billing`, `can_use_sales_scout`.

Ich erweitere das um sinnvolle, im Partner-Portal tatsächlich nutzbare Rechte:


| Recht (Spalte)             | Bedeutung                                                        |
| -------------------------- | ---------------------------------------------------------------- |
| `can_manage_members`       | Mitglieder einladen/bearbeiten/löschen (sonst nur Partner-Admin) |
| `can_manage_branding`      | Branding / Whitelabel ändern                                     |
| `can_view_reporting`       | Reporting-Seite öffnen                                           |
| `can_manage_tenants`       | Eigene Tenants verwalten (mehr als nur sehen)                    |
| `can_manage_sales_catalog` | (bestehend) Geräte-Katalog & Auswahlregeln                       |
| `can_create_tenant`        | (bestehend) Neue Tenants anlegen                                 |
| `can_view_billing`         | (bestehend) Abrechnung sehen                                     |
| `can_use_sales_scout`      | (bestehend) Sales Scout nutzen                                   |


Partner-Admins haben implizit alle Rechte (wie heute über `partner_member_can`).

## Schutz „letzter Admin"

Ein Datenbank-Trigger `prevent_last_partner_admin_removal()` auf `partner_members` blockiert:

- `DELETE` eines `partner_admin`, wenn er der einzige aktive Admin des Partners ist
- `UPDATE` von `partner_role` weg von `partner_admin`, wenn dadurch kein Admin übrig bliebe

Fehlermeldung: „Der letzte Partner-Admin kann nicht entfernt oder herabgestuft werden."

Das UI prüft dieselbe Bedingung clientseitig und deaktiviert Lösch-/Demote-Buttons mit erklärendem Tooltip — die DB bleibt die finale Sicherung.

## UI-Änderungen `src/pages/partner/PartnerMembers.tsx`

1. **Neuer „Bearbeiten"-Dialog** je Zeile mit:
  - Rolle (Partner-Admin / Partner-User)
  - Checkbox-Liste für alle 8 Rechte (nur sichtbar/aktiv für `partner_user`; bei `partner_admin` ausgegraut mit Hinweis „alle Rechte")
  - Speichern → `update` auf `partner_members`
2. **Einladungs-Dialog** erweitern um dieselbe Rechte-Auswahl beim ersten Anlegen.
3. **Löschen-Button** deaktiviert für letzten Admin (mit Tooltip).
4. **Rollen-Spalte** zeigt zusätzlich Anzahl gesetzter Rechte als kleinen Badge bei `partner_user`.

Alle Buttons sind nur sichtbar/aktiv, wenn aktueller User `isPartnerAdmin` ODER `permissions.manageMembers` (neues Recht) ist.

## Hook & Helper

- `src/hooks/usePartnerAccess.tsx`: `permissions` um `manageMembers`, `manageBranding`, `viewReporting`, `manageTenants` erweitern.
- `public.partner_member_can()` SQL-Funktion: neue Permission-Keys (`manage_members`, `manage_branding`, `view_reporting`, `manage_tenants`) ergänzen.
- `src/components/partner/PartnerSidebar.tsx`: bestehende `show`-Flags um die neuen Permissions ergänzen, wo passend (Branding, Reporting).

## Edge Function `partner-invite-member`

Body um optionales `permissions: { ... }` Objekt erweitern und beim `INSERT` in `partner_members` mitschreiben.

## Migration (Schritt-für-Schritt)

```sql
ALTER TABLE public.partner_members
  ADD COLUMN can_manage_members  boolean NOT NULL DEFAULT false,
  ADD COLUMN can_manage_branding boolean NOT NULL DEFAULT false,
  ADD COLUMN can_view_reporting  boolean NOT NULL DEFAULT false,
  ADD COLUMN can_manage_tenants  boolean NOT NULL DEFAULT false;

-- partner_member_can() um neue Keys erweitern
-- Trigger prevent_last_partner_admin_removal() (BEFORE DELETE OR UPDATE)
```

## Nicht im Scope

- Keine Änderung an Super-Admin-Sicht (`SuperAdminPartners`).
- Keine Tenant-User-Rollen — nur Partner-Portal.
- Keine Auth-Account-Löschung (nur Membership entfernen, wie bisher).