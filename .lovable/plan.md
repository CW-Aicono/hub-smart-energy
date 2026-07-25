
# Plan: Ad-Hoc Payment für Ladeinfrastruktur (CCV-Integration)

## 1. Recherche-Ergebnis CCV (Kurzfassung)

CCV bietet für EV-Ad-Hoc kein vollwertiges CPO-Backend, sondern **drei Bausteine**, die wir kombinieren:

| Baustein | Was es ist | Rolle bei uns |
|---|---|---|
| **CCV Terminals** (Edge IM15 / IM25 / IM30) | Unattended-Kartenterminals (Kontaktlos, Chip, PIN, QR), Android-basiert | Hardware an der Wallbox — direkter Kartenakzeptanz-Layer (AFIR-konform ab 50 kW) |
| **CCV Charge** | White-Label Payment-App auf dem Terminal (brandbar) | Terminal-UI in Kunden-CI (AICONO / CCV / REWE / T&R) |
| **CCV Cloud-Connect EVC** | OCPI-basierte Payment-Middleware (REST, Webhooks, Preauth/Capture/Refund, Idempotency) | **Unsere Backend-Integrationsschicht** — CCV spricht OCPI zu uns, wir bleiben CPO |

**Wichtig für die Architektur:**
- CCV wird **PSP + Terminal-Anbieter**, wir bleiben **CPO/CPMS** (unser OCPP-Backend, unsere Tarife, unsere Abrechnung).
- Kopplung erfolgt über **OCPI 2.2.1** (`Locations`, `Tariffs`, `Sessions`, `CDRs`, `Commands`, `Tokens`). Das passt zu unserem bestehenden Roaming-Modell (siehe `roaming_settings`/`roaming_partners`).
- Eichrecht bleibt bei der Ladesäule (nicht bei CCV) — für uns nur relevant, dass wir signierte Messwerte durchreichen (haben wir via OCMF K1-Update bereits).
- **AFIR-Pflicht** seit 13.04.2024: neue DC-Ladepunkte ≥ 50 kW brauchen Kartenterminal. Das ist der Marktdruck für dieses Modul.

**White-Label für CCV-Kunden (REWE, Tank & Rast):** CCV betreibt in dem Szenario eine White-Label-Instanz unserer Software. Dafür muss unser Stack **mandantenfähig auf Partner-Ebene** ausgelegt sein (haben wir teilweise via Partner-Portal) und die CCV-Integration muss **pro Tenant konfigurierbar** sein, nicht global.

## 2. Umfang (MVP)

### In-Scope
- Neues Sub-Modul **„Ad-Hoc Payment"** unter Ladeinfrastruktur → Einstellungen (neuer Tab neben OCPP / Rechnungsdesign / Roaming / Lade-App).
- Anbindung **CCV Cloud-Connect EVC** als erster (und vorerst einziger) PSP-Adapter, hinter einem sauberen Interface, damit Nayax/Payter/Adyen später ohne Rewrite folgen können.
- **OCPI-Endpunkte auf unserer Seite** (Server-Rolle CPO): `Locations`, `Tariffs`, `Sessions`, `CDRs`, `Commands`, `Tokens` — mindestens die für Ad-Hoc nötigen Verben.
- **Terminal-Registrierung**: pro Ladepunkt kann ein CCV-Terminal (Serial / Terminal-ID) hinterlegt werden. 1:1 oder 1:n (ein Terminal für mehrere Connectoren einer Säule).
- **Payment-Flow Ad-Hoc**: Tap → Preauth (z. B. 40 €) → `RemoteStartTransaction` via OCPP → Ladung → `StopTransaction` → CDR → Capture des tatsächlichen Betrags → Refund-Differenz → Beleg (PDF + QR-E-Receipt).
- **Modul-Toggle + eigener Preis** im Super-Admin (analog Dokumentationsmodul), inkl. Tenant-Aktivierung via `ModuleGuard`.
- **Neue Rollen-Rechte**: `charging.payments.view`, `charging.payments.configure`, `charging.payments.refund`.
- **Reporting-Erweiterung**: Ad-Hoc-Umsätze, Refund-Quote, PSP-Gebühren im bestehenden `/charging/reporting`.

### Out-of-Scope (bewusst, spätere Phase)
- Vollständige EMSP-Rolle / eigenes Roaming-Hub (bleibt Roaming-Modul).
- Andere PSPs (Nayax etc.) — nur Interface, keine Implementierung.
- Kompletter White-Label-Onboarding-Flow für CCV als Betreiber unserer Software — dazu **eigener Folgeplan** (siehe §7).
- Eichrechts-Zertifizierung der Terminals (Sache der Säule).

## 3. Klärungspunkte vor Start

1. **CCV-Vertragslage:** Haben wir bereits einen Sandbox-/Partner-Zugang zu `developer.myccv.eu` (Cloud-Connect EVC)? Ohne den geht Phase 2 nicht los.
2. **Merchant-Modell:** Ist CCV **Merchant of Record** (Geld fließt an CCV → Auszahlung an Tenant) oder wir? Beeinflusst Rechnungsstellung + Steuerlogik massiv.
3. **Terminal-Beschaffung:** Bestellt der Tenant Terminals bei CCV direkt und wir onboarden nur, oder soll AICONO Reseller sein?
4. **Beleg-Anforderung:** Kassenbeleg via QR (CCV E-Receipt) — reicht das, oder brauchen wir zusätzlich einen eigenen PDF-Beleg im EMS (analog CDR-Rechnung)?

## 4. Technischer Plan

### 4.1 Datenmodell (neue Tabellen, alle multi-tenant + RLS + GRANTs)

```text
payment_providers            (id, tenant_id, type='ccv'|'nayax'|..., display_name,
                              config jsonb, credentials_secret_ref, status, ...)
payment_terminals            (id, tenant_id, provider_id, terminal_serial,
                              charge_point_id, connector_id nullable, location_id,
                              status, last_seen_at, firmware, brand_profile jsonb)
adhoc_payment_sessions       (id, tenant_id, terminal_id, charge_point_id,
                              connector_id, ocpp_transaction_id nullable,
                              psp_reference, preauth_amount_cents, currency,
                              captured_amount_cents, refunded_amount_cents,
                              state enum, started_at, ended_at, error jsonb)
payment_events               (id, session_id, tenant_id, direction in|out,
                              provider_event_id, type, payload jsonb, received_at)
ocpi_endpoints               (id, tenant_id, role CPO|EMSP, party_id, country_code,
                              base_url, token_a, token_c, version, status)
ocpi_tokens                  (id, tenant_id, uid, type, contract_id, issuer,
                              valid, whitelist enum, last_updated)
```

- `payment_events` ist der Audit-Trail für Webhook-Idempotenz (CCV Cloud-Connect erfordert Idempotency-Keys).
- Kein Speichern von PAN/CVV/Track-Daten — nur PSP-Referenzen. PCI-Scope bleibt bei CCV.
- Retention für `payment_events`: 24 Monate (Steuer/Reklamation).

### 4.2 Edge Functions

| Function | Zweck |
|---|---|
| `ccv-webhook` | Inbound Webhooks von CCV Cloud-Connect (Payment-Status, Preauth OK, Capture, Refund, Terminal-Events). Signaturprüfung, Idempotency, Weiterreichung an State-Machine. |
| `ccv-payment-command` | Outbound: Preauth erstellen, Capture, Cancel, Refund gegen CCV Mapi/Cloud-Connect REST. |
| `adhoc-charge-orchestrator` | State-Machine: Terminal-Tap → Preauth → OCPP RemoteStart → Session-Tracking → StopTransaction → CDR → Capture/Refund → Beleg. |
| `ocpi-cpo-*` | OCPI-CPO-Endpunkte (`/ocpi/2.2.1/locations`, `/tariffs`, `/sessions`, `/cdrs`, `/commands`, `/tokens`) — mindestens die von CCV Cloud-Connect konsumierten Verben. |
| `ocpi-token-authorize` | `Authorize`-Callback aus OCPI, prüft ob Token laden darf (Whitelist, Sperren). |

Wiederverwendung: `invokeWithRetry.ts`, `fetchWithRetry`, `authClient` (per Memory-Regeln).

### 4.3 Frontend (unter existierendem `/charging/settings`)

Neuer Tab **„Ad-Hoc Payment"** mit drei Unterkarten (analog Roaming):
1. **PSP-Verbindung**: CCV Cloud-Connect Zugangsdaten (Party-ID, Token, Endpoint, Umgebung Sandbox/Prod), Verbindungstest.
2. **Terminals**: Liste + Zuordnung zu Ladepunkten, Status (online/offline/last seen), Branding-Profil-Auswahl (CCV Charge Farb-/Logo-Config).
3. **Payment-Regeln**: Preauth-Betrag, Währung, max. Sessiondauer, Refund-Policy, Beleg-Vorlage.

Zusätzlich:
- Neuer Menüpunkt-Eintrag unter Ladeinfrastruktur → „Ad-Hoc Transaktionen" (Liste + Detailansicht mit Timeline von `payment_events`, Refund-Button hinter `charging.payments.refund`).
- Kachel im ChargePoint-Detail: „Terminal verbunden: XY, letzter Tap vor 2 Min" (bei vorhandenem Recht).
- Reporting-KPIs in `ChargingReporting.tsx`: Ad-Hoc-Umsatz, Ø-Warenkorb, Erfolgsquote, Refund-Quote.

Alle Zahlen in `toLocaleString("de-DE")` (Memory-Regel).

### 4.4 Super-Admin

- Modul „Ad-Hoc Payment" in Modul-Verwaltung (eigener Preis, aktivierbar pro Tenant).
- Flotten-Übersicht aller CCV-Terminals aller Tenants (nur `super_admin`, `tenant_id IS NULL`-Trennung beachten).
- Monitoring: fehlgeschlagene Webhooks, offene Preauths > 24 h.

### 4.5 Sicherheit

- CCV-Credentials in Supabase Secrets, nie im Frontend.
- Webhook-HMAC-Signaturprüfung pflicht, Reject wenn ungültig.
- Idempotency-Keys pro `payment_events.provider_event_id` (Unique-Index).
- Rollen: neue Permissions in bestehendem RBAC-System, RLS auf allen neuen Tabellen strikt `tenant_id`-gebunden.
- Keine PAN/Track2 speichern. Nur `psp_reference`, letzten 4 Ziffern, Kartenmarke.

## 5. Umsetzungs-Phasen

1. **Phase 0 — Voraussetzungen (extern)**: CCV-Partner-Onboarding, Sandbox-Zugang, Test-Terminal. Ohne diesen Schritt keine Codierung möglich.
2. **Phase 1 — Backend-Fundament**: Tabellen, RLS, GRANTs, Modul-Toggle, OCPI-CPO-Endpoints skelettartig, PSP-Interface abstrakt.
3. **Phase 2 — CCV-Adapter**: Cloud-Connect REST-Client, Webhook-Handler, State-Machine für Preauth/Capture/Refund gegen CCV-Sandbox.
4. **Phase 3 — Frontend**: Einstellungen-Tab, Terminal-Verwaltung, Transaktionsliste, ChargePoint-Kachel.
5. **Phase 4 — Ende-zu-Ende gegen Test-Terminal**: Tap → Ladung → Beleg. Refund-Flow. Idempotenz + Fehlerpfade.
6. **Phase 5 — Reporting + Super-Admin-Flottenmonitor + Rollen/Preis.**
7. **Phase 6 — Pilot** mit einem realen Standort, dann Rollout-Freigabe.

## 6. Abhängigkeiten / Risiken

- OCPI-CPO-Implementierung ist Aufwand (Interop-Testing gegen CCV). Vorschlag: nur die von CCV konsumierten Verben zuerst, Rest iterativ.
- CCV-Sandbox-Zugang ist Bottleneck.
- Terminal-Firmware-Updates: Verantwortung klären (CCV vs. wir).
- AFIR-Konformität: Wir müssen Preisanzeige (kWh, Zeit, Blockiergebühr) vor Preauth am Terminal darstellen — Templates in `CCV Charge` konfigurieren.

## 7. White-Label-Szenario „CCV betreibt AICONO für REWE/T&R" (Folgeplan-Skizze)

Nicht Teil dieses MVPs, aber Weichen jetzt richtig stellen:

- **Partner-Ebene** in bestehendem Partner-Portal um „Betreiber-Partner" (CCV) erweitern: eigene Subdomain (`ccv-charge.aicono.org` oder `charge.ccv.eu`), eigenes Branding pro Sub-Tenant (REWE, T&R als Tenants unter Partner CCV).
- PSP-Provider-Config vererbbar Partner → Tenant (CCV muss nur einmal Credentials hinterlegen).
- Eigener OCPI-Party-ID-Namespace pro Partner.
- Rechnung/Modul-Preise auf Partner-Ebene abrechenbar (Partner zahlt, nicht End-Tenant).
- Rechtliches: DPA + AV-Vertrag CCV ↔ AICONO, Merchant-of-Record-Modell final klären.

Wenn MVP steht, folgt hierfür ein eigener Plan mit UI-Wireframes und Vertrags-Checkliste.

---

**Nächster Schritt nach Freigabe:** Ich starte mit Phase 1 (Datenmodell + Modul-Toggle + leerer Tab) und öffne parallel die 4 Klärungsfragen aus §3 an dich.
