# AICONO Portal statt Super-Admin

## Ziel
Der Super-Admin-Bereich wird zum **AICONO Portal**. Es hat eine klare Gliederung in Übersicht, Kaufmännisch und Technisch. Die AICONO-Mitarbeiter bekommen dort Rollen nach Aufgabe. Das Portal bleibt genauso streng abgesichert wie heute.

## Rollen
- **Portal-Admin**: darf alles und verwaltet die Portal-Benutzer. Alle bisherigen Super-Admins werden automatisch Portal-Admin, ihre Rechte bleiben gleich.
- **Kaufmännisch**: Buchhaltung und Abrechnung bearbeiten. Übersicht bearbeiten, Roadmap nur ansehen.
- **Technisch**: Gateways, Templates, Monitoring und Support bearbeiten. Roadmap bearbeiten, Kunden, Partner, C-Level und Sales Scout nur ansehen.
- Eine Person kann mehrere Portal-Rollen haben.
- Schutz bleibt: Man kann sich nicht selbst entfernen, und der letzte Portal-Admin kann nicht entfernt werden.

## Neue Menüstruktur
```text
AICONO Portal
├─ Übersicht       (kaufm. bearbeitet, techn. liest; Roadmap umgekehrt)
│   Dashboard · Kunden · Partner · C-Level · Statistiken · Sales Scout · Roadmap
├─ Kaufmännisch
│   Abrechnung · Aktive Lizenzen · Gain-Sharing · Modulpreise · Bundles
├─ Technisch
│   Gateway-Flotte · Loxone-Templates · Wallbox-Templates · OCPP (Ladepunkte,
│   Integrationen, Control, Firmware, Simulator) · Monitoring · Support
└─ Verwaltung      (nur Portal-Admin)
    Portal-Benutzer & Rollen · Einstellungen
```
- Man sieht nur die Bereiche, für die man eine Rolle hat.
- Ohne Recht auf eine Seite erscheint ein klarer Hinweis „Kein Zugriff“. Es gibt keine leere Seite.
- Im Umschalter oben rechts steht „AICONO Portal“ statt „Super-Admin“.
- Die Adressen (`/super-admin/...`) bleiben gleich, damit Lesezeichen und Links weiter funktionieren.

## Sicherheit
- Rechte prüft weiterhin die Datenbank und nicht die Oberfläche.
- „Nur ansehen“ wird auch in der Datenbank erzwungen, nicht nur durch ausgeblendete Buttons.
- Super-Admin und Mandanten bleiben streng getrennt. Portal-Benutzer haben keinen Mandanten.
- Die Remote-Sitzung zu Kunden bleibt unverändert und wird weiter protokolliert.

## Vorgehen (in zwei Schritten, damit nichts kaputtgeht)
1. **Struktur und Rollen**: neue Rollen, automatische Übernahme der Super-Admins, neues Menü, Seitenschutz und Verwaltung der Portal-Benutzer. Alle bestehenden Datenbankregeln mit „super_admin“ gelten weiter für Portal-Admins.
2. **Feinrechte in der Datenbank**: Schreibrechte je Tabelle oder Funktion für Kaufmännisch und Technisch. Dafür werden alle Stellen, die Super-Admin-Rechte prüfen, einzeln durchgesehen.

## Prüfung
- Build und Typprüfung.
- Mit drei Testkonten durchklicken: Admin, nur Kaufmännisch, nur Technisch.
- Gegenprobe: Ein technischer Benutzer versucht eine Rechnung zu ändern und wird von der Datenbank abgewiesen.
- Handbuch in 4 Sprachen, Changelog, Release Notes und Version 1.6.0 werden aktualisiert.

## Technische Details
- Enum `app_role` um `portal_commercial` und `portal_technical` erweitern. `super_admin` bleibt als Portal-Admin bestehen, damit vorhandene RLS, `has_role` und Edge-Functions nichts verlieren.
- Neue SQL-Funktionen `is_portal_member(uid)`, `can_portal_write(uid, area text)` und `can_portal_read(uid, area text)` (security definer). Die Bereiche sind `overview`, `commercial`, `technical`, `roadmap` und `admin`.
- Hook `usePortalAccess()` ersetzt die reine `useSuperAdmin`-Prüfung in Seitenleiste, Wrapper und `useAreaAccess`. `PortalGuard area=... mode=read|write` schützt jede Route.
- Neuaufbau von `SuperAdminSidebar.tsx` mit vier Gruppen. `SuperAdminRoles/Users` werden zur Verwaltung der Portal-Benutzer mit Rollen-Checkboxen. Edge-Function `portal-set-role` prüft, ob der Aufrufer Portal-Admin ist, und schützt den letzten Admin.
- Schritt 2: RLS-Policies der Abrechnungstabellen (`tenant_invoices`, `module_prices`, `module_bundles`, ...) auf `can_portal_write(...,'commercial')`, der Technik-Tabellen (`gateway_*`, `loxone_template_registry`, `wallbox_*`, `cp_firmware_*`, ...) auf `'technical'` erweitern. Das geschieht als idempotente Migrationen (supabase + drizzle).
- `areaPreference`: Label „AICONO Portal“, der Schlüssel `super_admin` bleibt aus Kompatibilitätsgründen.
