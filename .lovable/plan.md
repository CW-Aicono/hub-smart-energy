# Energy-Sharing Modul – Architektur & Umsetzungsplan

## 1. Grundsatzentscheidung: Ein Projekt, drei Oberflächen

**Empfehlung: Im bestehenden Projekt belassen, getrennt über Subdomains und PWA-Manifeste.**

Begründung:

- Shared Backend (Supabase, Auth, Tenants, Locations, Meters, Smart-Meter-iMSys-Gateway, Pricing, Lexware-Billing) ist bereits da. Ein zweites Projekt würde 80% davon duplizieren.
- Pattern existiert schon: `manifest.json`, `manifest-ev.json`, `manifest-te.json`, `manifest-sales.json` zeigen, dass Multi-PWA aus einem Repo bereits etabliert ist.
- Memory `[PWA Architecture]` bestätigt: Multi-PWA-Support ist Architektur-Standard (Meter Mate, SmartCharge, Mein Strom).
- Marktplatz braucht öffentliche SEO-Seiten ohne Login – das geht sauber über eine eigene Subdomain mit eigener Route-Gruppe im selben Vite-Build (analog `/demo`, `/embed/pitch`, `/charge/:id`).

Ein **separates Projekt** wäre nur sinnvoll, wenn der Marktplatz später ein komplett anderes Tech-Team, eigene Release-Zyklen oder einen eigenen Trust-Stack (z. B. PCI-DSS) braucht. Davon sind wir weit entfernt.

## 2. Drei Rollen → Drei Subdomains → Eine Codebase


| Rolle                       | Subdomain                                                   | Login                                           | Zielgruppe                                 | Technisch                                                                                                                              |
| --------------------------- | ----------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Community-Manager**       | `kluub.aicono.org` (oder als Modul in `ems-pro.aicono.org`) | Tenant-Login (bestehend)                        | Stadtwerke, Genossenschaften, Tenant-Admin | Neues Modul `energy_sharing` im bestehenden Tenant-Bereich, ModuleGuard-geschützt                                                      |
| **Mitglieder-App**          | `mein.aicono.org` oder `app.kluub.de`                       | Endkunden-Login (neue Rolle `community_member`) | Mitglieder der Energiegemeinschaft         | Neue PWA (`manifest-kluub.json`), eigene Route-Gruppe `/member/*`, schlanke Mobile-UI                                                  |
| **Öffentlicher Marktplatz** | `kluub.de` oder `marktplatz.aicono.org`                     | Kein Login (Public)                             | Interessenten                              | Public-Route-Gruppe `/public/kluub/*` analog zu `/demo`, SEO-optimiert (SSG/Pre-render via Vite-Plugin oder statisches Build-Snapshot) |


**Routing-Erkennung:** `window.location.hostname` in `App.tsx` bestimmt die Route-Gruppe (Pattern existiert bereits für Charging-PWA). Kein zweiter Build nötig.

## 3. Modul-Definition

Neues Modul `energy_sharing` im `module_prices`/`tenant_modules`-System:

- **Modul-Code:** `energy_sharing`
- **Abhängigkeiten:** `electricity` (Zähler/Allokation), `smart_meter_imsys` (15-Min-Lastgänge für §42c EnWG-Abrechnung), `metering`
- **Preis-Vorschlag:** Kommunen 49 €/Mo, Standard 79 €/Mo + Member-basierte Staffel (z. B. 0,50 € pro aktivem Mitglied/Monat als Add-on, später)
- **ModuleGuard:** Sidebar-Eintrag "Energy Sharing" nur sichtbar wenn Modul aktiv

## 4. Datenmodell (neue Tabellen, alle `tenant_id`-scoped + RLS)

```text
energy_communities          → eine Gemeinschaft pro Tenant kann mehrere haben
  id, tenant_id, name, slug (public), region_plz[], type (genossenschaft|stadtwerk|nachbarschaft),
  registered_at, status, contract_template_id, settings (jsonb)

community_members           → Endkunden in einer Community
  id, community_id, tenant_id, user_id (auth.users), member_no,
  joined_at, left_at, role (member|producer|prosumer|consumer),
  malo_id, melo_id (für Smart-Meter-Zuordnung),
  share_kw (Anteil an Erzeugungsanlagen), status

community_assets            → eingebrachte Erzeuger/Speicher
  id, community_id, tenant_id, location_id, meter_id,
  asset_type (pv|wind|chp|storage), capacity_kw, share_model (gleich|nach_anteil|dynamisch)

community_allocations       → 15-Min-Verteilrechnung (Output von Allocation-Engine)
  id, community_id, tenant_id, bucket (timestamptz), member_id,
  consumed_kwh, allocated_from_community_kwh, residual_grid_kwh,
  price_community_ct, price_grid_ct, savings_eur

community_tariffs           → interner Gemeinschaftstarif
  id, community_id, valid_from, valid_to, price_ct_kwh, feed_in_ct_kwh

community_invoices          → monatliche Mitgliederabrechnung (PDF)
  id, community_id, member_id, period_start, period_end,
  total_eur, pdf_storage_path, status (draft|issued|paid)

community_marketplace_listings  → öffentlicher Marktplatz
  id, community_id, plz[], available_slots, headline, description,
  cover_image, contact_email, published (bool)
```

Erweiterung bestehender Tabellen:

- `profiles` / neue Rolle `community_member` in `app_role` Enum
- `meters.community_member_id` (nullable FK) für direkte Zuordnung

## 5. Kern-Engines (Edge Functions)

1. `**community-allocator**` – Cron, läuft täglich nach MSCONS-Import. Liest 15-Min-Werte aller Community-Member-Zähler, verteilt Community-Erzeugung nach gewähltem `share_model`, schreibt `community_allocations`.
2. `**community-billing**` – Monatlich, erzeugt `community_invoices` + PDF (jsPDF, analog `generateChargingInvoicePdf.ts`), optional Lexware-Sync.
3. `**community-join**` – Public-Endpoint für Marktplatz-Beitritt: PLZ-Check → passende Communities → Vertrag (PDF) → E-Mail-Verifikation → `community_members`-Eintrag (status `pending`).

## 6. UI-Bausteine

**Community-Manager (Tenant-Bereich):**

- `/community` Übersicht (Mitglieder, Erzeuger, Erlöse, CO₂)
- `/community/members` CRUD, Einladungs-Workflow
- `/community/assets` Anlagen einbringen
- `/community/tariff` Interner Tarif + Verteilmodell
- `/community/billing` Monatsabrechnung, Lexware-Export
- `/community/marketplace` Eigenes Listing pflegen

**Mitglieder-App (PWA, eigene Subdomain):**

- Dashboard: aktueller Community-Anteil, Monatsersparnis, CO₂
- Verbrauchsverlauf (15-Min) mit Community- vs. Rest-Strom
- Rechnungen (PDF-Download)
- Profil + Vertrag

**Öffentlicher Marktplatz (Public, eigene Subdomain):**

- Landing mit PLZ-Suche
- Listing-Detail pro Community
- 5-Min-Onboarding: PLZ → Community wählen → Daten → Vertrag → Bestätigung

## 7. Umsetzungs-Phasen

**Phase 1 (Foundation, ~1 Woche):**

- Modul `energy_sharing` in `module_prices` + ModuleGuard
- DB-Migration: `energy_communities`, `community_members`, `community_assets`, `community_tariffs`
- Tenant-UI: Community anlegen + Mitglieder verwalten (manuell)
- Rolle `community_member` in `app_role`

**Phase 2 (Allocation & Billing, ~1–2 Wochen):**

- `community_allocations`-Tabelle + `community-allocator` Edge Function
- `community-billing` + PDF
- Tenant-UI: Tarif, Abrechnungs-Liste, Lexware-Export

**Phase 3 (Mitglieder-PWA, ~1 Woche):**

- Subdomain-Routing in `App.tsx` (Hostname-Switch)
- `manifest-kluub.json` + Service-Worker
- Member-Dashboard, Verbrauchs-Charts, Rechnungs-Download

**Phase 4 (Marktplatz, ~1 Woche):**

- Public-Route-Gruppe `/public/kluub/*`
- Listings-Tabelle + Manager-UI
- PLZ-Suche, Join-Wizard, `community-join` Edge Function
- SEO (sitemap, JSON-LD `Organization` + `Offer`, Open-Graph)

**Phase 5 (Compliance, parallel):**

- §42c EnWG / §50 MsbG Vertragstexte (rechtliche Prüfung – wie bei iMSys-Consent)
- Bilanzkreis-Anbindung (später, optional)

## 8. Offene Punkte zur Entscheidung

1. **Domain-Strategie:** Eigene Marke `kluub.de` (Marktplatz braucht starken eigenen Brand) oder Subdomains unter `aicono.org`? Empfehlung: `kluub.de` als Marktplatz-Brand, `mein.kluub.de` für Mitglieder, Community-Manager bleibt in `ems-pro.aicono.org`.
2. **Mitglieder-Auth:** Eigene Auth-Instanz (Magic-Link, geringe Hürde) oder bestehender Supabase-Auth mit neuer Rolle? Empfehlung: bestehender Auth + Rolle `community_member`, getrennter Login-Screen auf der Mitglieder-Subdomain.
3. **Allokations-Modell zuerst:** Statisch (gleicher %-Anteil) oder dynamisch (nach Echtzeit-Verbrauch)? Empfehlung: Phase 2 zuerst statisch, dynamisch in Phase 5.
4. **Lexware-Integration für Member-Rechnungen:** B2C-Rechnung via Lexware sinnvoll oder eigene PDF + SEPA-Mandat? Empfehlung: eigene PDF + SEPA für Member, Lexware nur für die Community-Gebühr Tenant→AICONO.

## Antwort auf die Kernfrage

**Kein eigenes Projekt.** Energy Sharing wird ein Modul im bestehenden Repo. Die drei Oberflächen werden über Subdomain-Erkennung im selben Vite-Build ausgeliefert – analog zur bereits etablierten Multi-PWA-Architektur (`manifest-ev.json` etc.). Marktplatz und Mitglieder-App bekommen jeweils eine eigene Subdomain für Branding/SEO, aber teilen Backend, Auth, Tenants, Smart-Meter-Daten und Billing.  
  
Hier die Antworten auf Punkt 8: Offene Punkte zur Entscheidung:  
  
1. Domain-Strategie: wir starten mit kluub.de, diese Domain kann sich aber noch ändern. Es kann auch sein, dass wir später nicht mit eigener Marke, sondern mit Subdomain arbeiten werden.  
  
2. Mitglieder-Auth: bestehender Auth + Rolle  
  
3. Allokations-Modell zuerst: Phase 2 zuerst statisch, dynamisch in Phase 5.  
  
4. In einem anderen Projekt entsteht aktuell eine komplette Rechnungs-Software. Aktuell sollen daher nur Abrechnungen erzeugt werden, die wir dann über eine API in Zukunft an das eigene Tool übergeben werden. API folgt später.  
  
  
  