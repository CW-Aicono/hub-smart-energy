## Ausgangslage
Phase 1 (Iter A + B) ist live: Community-Gründung, Mitglieder-Lifecycle, Verträge, PLZ/VNB, Dashboard, Detailseite.
Es folgen drei Iterationen, die die offenen Punkte 9–21 aus der Gap-Analyse abdecken.

---

# Iteration C — Phase 2 Kern (Punkte 9–13)
**Ziel:** MSCONS produktiv, Allokationsengine, monatliche Abrechnung im System.

## C1. MSCONS-Import produktiv (Punkt 9)
- `supabase/functions/smart-meter-mscons-import` Skeleton ausbauen:
  - EDIFACT-Parser (UNB/UNH/BGM/DTM/LIN/QTY/UNT/UNZ) als Modul `_shared/edifact/mscons.ts`.
  - Unterstützung Profile **MSCONS 2.4c** (Lastgang ¼-h, Tageswerte) — minimal nötiger Subset.
  - Mapping: MeLo → `community_members.melo_id` → `member_id`.
  - Schreibt nach neuer Tabelle `community_member_readings_15min` (tenant_id, community_id, member_id, ts_start, kwh, direction enum `consumption|feed_in`, source `mscons`, raw_segment).
  - Idempotenz über `(member_id, ts_start, direction)` Unique-Index + existierender `file_hash`.
- Audit-Tabelle `smart_meter_mscons_imports` um `parsed_intervals`, `parser_version`, `error_segments jsonb` erweitern.
- UI-Tab „Datenimport" in `EnergySharing.tsx`: Upload, History, Status-Badge, Fehler-Drilldown.

## C2. Allokationsengine (Punkt 10)
- Neue Edge Function `community-allocation-run`:
  - Eingabe: `community_id`, `period_start`, `period_end` (typisch 1 Tag).
  - Liest 15-min-Erzeugung der Community-Assets (`community_assets` × `meter_period_totals`/5-min) und Verbrauch je Mitglied (`community_member_readings_15min`).
  - Berechnet **statische Quote** = `member.share_kw / Σ share_kw` (MVP). Optionale Strategien als Enum `allocation_strategy` (`static_share`, `dynamic_pro_rata`, `priority`) — nur statisch implementiert, Hooks für später.
  - Schreibt in neue Tabelle `community_allocations_15min` (community_id, member_id, ts_start, allocated_kwh, surplus_to_grid_kwh, strategy, run_id).
  - Lauf-Metadaten in `community_allocation_runs` (status, totals, error).
- Cron via `pg_cron` täglich 02:30 für alle aktiven Communities (Insert-Tool, kein Migration).
- UI: Dashboard-Tab bekommt Karte „Letzter Allokationslauf" + Button „Jetzt neu berechnen" (Super-Admin & Owner).

## C3. Tarif- & Preislogik je Community (Punkt 11)
- Migration: `community_tariffs` (community_id, valid_from, valid_to nullable, internal_price_ct_per_kwh, grid_fee_ct_per_kwh, feed_in_price_ct_per_kwh, currency default `EUR`).
- Hook `useCommunityTariffs` (CRUD).
- Tab „Tarif" in `EnergySharing.tsx` erweitern (heute Platzhalter): Verlauf mit Gültigkeitszeiträumen, validiert nicht-überlappend.

## C4. Monatliche Mitgliederabrechnung (Punkt 12)
- Edge Function `community-billing-run` (param: `community_id`, `month`):
  - Aggregiert `community_allocations_15min` × `community_tariffs` (zeitlich korrekter Tarif).
  - Schreibt `community_member_invoices` (community_id, member_id, period_start, period_end, allocated_kwh, internal_amount_ct, grid_fee_ct, feed_in_credit_ct, total_ct, status `draft|issued|paid|voided`, pdf_path nullable, line_items jsonb).
  - PDF-Generierung via jsPDF analog `generateChargingInvoicePdf.ts` → Storage-Bucket `community-invoices` (private).
- Cron monatlich am 3. um 03:00.
- UI: neuer Tab „Abrechnung" pro Community — Tabelle Monate × Mitglieder, Status-Badges, PDF-Download, „Nochmals erzeugen" (nur draft).

## C5. Plausibilitäts-/Monitoring-Checks (Punkt 13)
- View/Function `community_data_quality` (pro Community: %-Mitglieder mit MSCONS letzte 7 Tage, Lücken >2 h, negative Werte, Asset-Coverage).
- Dashboard-Karte „Datenqualität" mit Ampel + Drilldown.
- Auto-Task (`tasks` Tabelle, `source_type=automation`, `source_label=energy_sharing`) bei Schwellwertverletzung — analog Integration-Errors-Trigger.

**Deliverables Iter C:** 1 Migration, 3 Edge Functions, 2 neue Tabs, 1 Cron-Bootstrap, PDF-Templates.
**Out of Scope C:** Auto-Mahnung, SEPA-Lastschrift, AS4, Marktplatz.

---

# Iteration D — Phase 3 + GTM (Punkte 18, 19)
**Ziel:** Marktplatz für Communities + Mitglieder-PWA „Mein Energie-Anteil".

## D1. Community-Marktplatz (Punkt 18)
- Migration `community_marketplace_listings` (community_id, title, description_md, region_plz_prefix, available_share_kw, price_internal_ct_per_kwh, status `draft|published|closed`, published_at).
- Migration `community_join_requests` (listing_id, requester_email, requester_name, address jsonb, requested_share_kw, message, status `new|in_review|accepted|declined`, internal_note).
- Edge Function `community-marketplace-public`:
  - GET öffentliche Listings (gefiltert PLZ/Region), POST Beitrittsanfrage (Rate-Limit per IP, Hcaptcha optional Phase 4).
- Öffentliche Seite `/sharing/marktplatz` (kein Auth, im `App.tsx` outside `ProtectedRoute`):
  - Listing-Grid + Detail + Beitrittsformular. AICONO-Branding, SEO-Tags.
- Backoffice-Tab „Marktplatz" in `EnergySharing.tsx`: Listings CRUD + Inbox Beitrittsanfragen, „Anfrage → Mitglied anlegen" (übernimmt Daten in Wizard-Member-Step).

## D2. Mitglieder-PWA „Mein Energie-Anteil" (Punkt 19)
- Neue PWA-Shell analog vorhandenem Multi-PWA-Setup (Meter Mate / SmartCharge):
  - `public/manifest-sharing.json`, eigenes Icon-Set, Route `/mein-anteil`.
  - Eigener isolierter Auth-Client (`src/integrations/supabase/sharingClient.ts`, storageKey `sb-sharing-auth-token`) — analog `tenantClient.ts`.
- Login: Magic-Link (E-Mail des Mitglieds) via bestehender Auth.
- Inhalte (read-only für Mitglied):
  - Mein Anteil (kW), aktueller Monat (kWh alloziert, eingespart, gutgeschrieben).
  - Tagesverlauf-Chart (Recharts) aus `community_allocations_15min`.
  - Aktuelle Rechnung als PDF.
  - Status der Onboarding-Schritte (invited → active).
- RLS-Policy: Mitglied sieht ausschließlich eigene Datensätze (Mapping über `auth.email() = community_members.email`).
- i18n: nur DE in Iter D (analog bestehender Energy-Sharing-Module).

**Deliverables Iter D:** 2 Migrationen, 1 Edge Function, 1 öffentliche Marketing-Seite, 1 PWA, neuer Tab.
**Out of Scope D:** Push-Notifications, Chat, Self-Service-Vertragsänderung.

---

# Iteration E — Industrialisierung (Punkte 14–17, 21)
**Ziel:** Buchhaltung, Zahlung, Marktkommunikation, Steuerung — Produktivbetrieb.

## E1. Buchhaltungs-Export (Punkt 14)
- **Primär: Lexware-Integration** (bestehender `LEXWARE_API_KEY` vorhanden, analog `generate-monthly-invoices`).
  - Edge Function `community-invoices-to-lexware`: pusht `issued` Rechnungen, schreibt `lexware_invoice_id` zurück.
- **Alternative Eigen-Export**: DATEV-CSV-Export (`community-invoices-datev-export`) als Fallback, wählbar per `community.accounting_target` (`lexware|datev_csv|none`).
- UI: Tab „Abrechnung" bekommt Buttons „An Lexware senden" / „DATEV-CSV".

## E2. SEPA-Lastschrift (Punkt 15)
- Migration `community_sepa_mandates` (member_id, iban_masked, iban_hash, bic, mandate_ref, signed_at, status).
- Wiederverwendung bestehender `src/lib/sepaXml.ts`.
- Edge Function `community-sepa-batch` erzeugt `pain.008` XML aus offenen `issued` Rechnungen, Storage-Bucket `community-sepa`.
- UI: Tab „SEPA" pro Community — Mandate verwalten, Batch erzeugen, Download, Status `pending|submitted|cleared|returned`.

## E3. AS4/Marktkommunikation (Punkt 16) — **Pragmatisch**
- **Kein eigener AS4-Stack** (zu teurer Eigenbau). Stattdessen:
  - Adapter-Tabelle `community_msb_endpoints` (community_id, msb_name, connection_type `manual_upload|sftp|partner_api`, credentials_encrypted via `BRIGHTHUB_ENCRYPTION_KEY`-Pattern).
  - Workflow „MSCONS-Anforderung" als Task (manueller Upload bleibt primärer Weg).
  - Optionaler Partner-Adapter (z. B. `seven2one`, `robotron`) als Edge Function-Stub `community-msb-partner` mit klarem Interface.
- Doku in `.lovable/memory/features/...` festhalten, dass voller AS4-Eigenbetrieb erst ab signifikantem Volumen sinnvoll ist.

## E4. Direktvermarktung & Marktdaten (Punkt 17)
- Reuse bestehende Spot-Preis-Pipeline (EPEX-Modul existiert laut Memory).
- Neue Karte „Marktwert Überschuss" im Community-Dashboard: Σ `surplus_to_grid_kwh` × Spotpreis (15-min-genau).
- Optionaler Hook für Direktvermarkter-API: nur Konfig-Feld `community.direct_marketer_id` + Stub-Function — kein echtes Onboarding in dieser Iter (zu fall-spezifisch).

## E5. Steuerungs-Empfehlungen / EMS-Bridge (Punkt 21)
- Integration mit vorhandenem **EMS Copilot** (Memory: `ems-copilot-functions`):
  - Neuer Copilot-Kontext „energy_sharing": Empfehlungen pro Community (z. B. „Lastverschiebung Mitglied X spart 12 €/Monat").
  - Daten-Provider liest `community_allocations_15min` + Spot.
- Optional: Schreibempfehlung an `building-automation` (Reuse `automation-core`) — nur als „Vorschlag annehmen"-Flow, kein Auto-Push.

**Deliverables Iter E:** 3 Migrationen, 3–4 Edge Functions, Lexware- & SEPA-Tabs, AS4-Adapter-Skeleton, Copilot-Erweiterung.
**Out of Scope E:** Echter AS4-Eigenbetrieb mit BNetzA-Zertifikat (Make-or-Buy-Entscheidung später), Direktvermarkter-Vollintegration.

---

## Reihenfolge & Aufwand (grob)
| Iteration | Dauer | Risiko | Blocker |
|---|---|---|---|
| C | 4–6 Wochen | Hoch (EDIFACT-Parser) | MSCONS-Testdaten vom VNB |
| D | 2–3 Wochen | Niedrig | Marketing-Content für Marktplatz |
| E | 4–5 Wochen | Mittel (Lexware-Vertrag, SEPA-Mandate juristisch) | Steuerberater-Freigabe SEPA-Texte |

## Verifikation je Iteration
- **C:** Test-MSCONS-Datei verarbeitet, Allokation läuft, PDF-Rechnung erscheint.
- **D:** Öffentliches Listing aufrufbar, Beitrittsanfrage landet im Backoffice, Mitglied loggt sich in PWA ein und sieht eigene Werte.
- **E:** Rechnung erscheint in Lexware-Sandbox, SEPA-XML validiert (ISO20022 Schema), Copilot-Karte zeigt Empfehlung.

## Bewusst nicht in dieser Roadmap
- Multi-Country (nur DE-Recht).
- Mieterstrom-Spezialregeln (eigenes Modul, später).
- Whitelabel-Marktplatz pro Tenant (möglich, aber Aufwand >2 Wochen — separates Backlog).
