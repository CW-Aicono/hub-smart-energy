# Phase 2a — Ad-Hoc Payment: Vorarbeit ohne CCV-Sandbox

Ziel: Alles bauen, was CCV-unabhängig ist. Sobald der Sandbox-Zugang da ist, wird nur der Adapter „scharf geschaltet".

## Was jetzt umsetzbar ist

### 1. Terminal-Verwaltung (UI + CRUD)

Auf `payment_terminals` (bereits in Phase 1 angelegt):

- Liste, Anlegen, Bearbeiten, Deaktivieren von Terminals (Modell IM15/IM25/IM30, Seriennummer, Standort, Notizen).
- Zuordnung Terminal ↔ Ladepunkt bzw. Terminal ↔ Ladepunkt-Gruppe (n:m oder 1:n — siehe Frage unten).
- Status-Feld (`online/offline/unknown`) wird zunächst manuell/pending gepflegt, später vom Adapter aktualisiert.
- Berechtigung: `charging.payments.configure`.

### 2. Payment-Regeln pro Ladepunkt

Neuer Abschnitt „Ad-Hoc Payment" in den Ladepunkt-Einstellungen bzw. im Tab:

- Toggle „Ad-Hoc erlaubt" pro Ladepunkt.
- Tarif-Auswahl für Ad-Hoc (nutzt bestehende `charging_tariffs`).
- Preauth-Betrag (Standard z. B. 50 €, überschreibbar) und Preauth-Ablauf.
- Min-/Max-Sessiondauer, Max-kWh-Cap.
- Optional: Rundungsregeln, Mindestbetrag.
- Anzeige der aktuell gültigen Regel in der Ladepunkt-Kachel.

### 3. State-Machine `adhoc-charge-orchestrator` mit Mock-Adapter

Edge Function, die den gesamten Lifecycle abbildet:
`created → preauth_pending → preauth_ok → charging → capture_pending → captured` (plus `failed/cancelled/refunded`).

- Adapter-Interface (`PaymentAdapter`) mit Methoden `preauth`, `capture`, `refund`, `cancel`.
- **MockAdapter** für lokale Tests (deterministische Antworten, konfigurierbare Fehlerszenarien).
- Späterer **CcvAdapter** implementiert dasselbe Interface — Umschaltung per Provider-Konfiguration.
- Vollständige Event-Historie in `payment_events`.

### 4. EMS-PDF-Rechnung für Ad-Hoc-Sessions

- Vorlage analog zu bestehenden `charging_invoices` (Nummernkreis, Layout).
- Automatische Erzeugung bei `captured`, Ablage in Storage, Download-Link in Session-Detail.
- Feld für Käufer-Angaben (E-Mail für Zusendung, optional Name/Anschrift bei Nachforderung).

### 5. Transaktions-/Session-Übersicht

Neue Seite `src/pages/ChargingAdHocTransactions.tsx`:

- Filter (Zeitraum, Standort, Ladepunkt, Status).
- Detail-Drawer mit Event-Timeline, Beleg-Download, Refund-Button (Permission `charging.payments.refund`).
- Export CSV/XLSX (deutsches Zahlenformat).

### 6. Super-Admin-Sicht

- Ansicht aller Payment-Provider-Konfigurationen tenant-übergreifend.
- Modul-Preis „Ad-Hoc Payment" in `module_prices` einpflegen (Preis noch offen — siehe Frage).
- Sichtbarkeit über bestehenden `ModuleGuard`.

## Was auf CCV-Sandbox wartet

- Konkrete Endpoint-URLs, Auth-Header, OCPI-Token-Austausch.
- Webhook-Signaturprüfung (Secret via `add_secret`).
- Ende-zu-Ende-Test gegen echte Terminals.
- `CcvAdapter`-Implementierung inkl. Fehler-Mapping.

## Technische Details

- Keine Schema-Änderungen nötig, außer ggf. `payment_terminals.charge_point_id` bzw. Join-Tabelle je nach Antwort auf Frage 1.
- Neue Edge Functions: `adhoc-charge-orchestrator`, `adhoc-invoice-generate`.
- Neue Frontend-Komponenten unter `src/components/charging/adhoc/` (Terminals-Liste, Regel-Editor, Session-Drawer).
- Mock-Adapter aktivierbar über Feature-Flag/Provider-Eintrag `provider_type='mock'`.

## Offene Fragen vor Umsetzung

1. **Terminal ↔ Ladepunkt**: 1 Terminal bedient genau 1 Ladepunkt, oder 1 Terminal für mehrere Ladepunkte (Multi-Charger-Setup wie bei Tank & Rast)?
2. **Preauth-Standardbetrag**: Systemweiter Default (z. B. 50 €) oder pro Tenant konfigurierbar?
3. **Refund-Freigabe**: Darf ein Tenant-Admin direkt refunden, oder muss Super-Admin freigeben?

**Modul-Preis**: Welchen Listenpreis für „Ad-Hoc Payment" in `module_prices` hinterlegen (oder erst später vom Super-Admin setzen lassen)?  
  
Antworten:  
1. Alle Versionen werden wir umsetzen können müssen, insofern bitte auch entsprechend vorbereiten und auslegen.  
2. Nicht nur pro Tenant, wahrscheinlich werden wir das mindesten auch pro Ladepunkt-Gruppe konfigurieren müssen.  
3. Tenant-Admin darf refunden.

&nbsp;