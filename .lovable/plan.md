

## Vertriebspartner-Tool "AICONO Sales Scout"

Ein neuer Bereich `/sales` (Mobile-First-PWA) im selben Projekt – nutzt bestehende Modul-/Preistabellen, Geräte-Registry und Mandanten-Anlage.

## Architektur

```text
[Vertriebspartner Tablet]
        │
        ▼
   /sales (Mobile-First-PWA)
   ┌─────────────────────────────────┐
   │ 1. Projekt anlegen (Kunde)      │
   │ 2. Liegenschaft + Etagen        │
   │ 3. Verteilungen (NSHV/UV)       │
   │    └─ Foto + KI-Vorschlag       │
   │ 4. Messpunkte je Verteilung     │
   │    └─ Scan / Manuell / KI       │
   │ 5. Geräte-Auswahl               │
   │    └─ Regelbasiert + KI         │
   │ 6. Module wählen (AICONO)       │
   │ 7. Angebot generieren           │
   │    ├─ PDF                       │
   │    ├─ Online-Link/QR            │
   │    └─ → Mandant vorbereiten     │
   └─────────────────────────────────┘
```

## Datenmodell (neue Tabellen)

- **sales_projects** – Projekt pro Termin: kunde_name, kontakt, status (draft/sent/accepted/rejected/converted), partner_id, created_at, accepted_at, public_token (für Online-Angebot)
- **sales_distributions** – NSHV/UV pro Projekt: name, typ (NSHV/UV), foto_url, ki_analyse (jsonb), parent_id (UV→NSHV)
- **sales_measurement_points** – Messpunkte pro Verteilung: bezeichnung, energieart, phasen (1/3), strombereich_a, anwendungsfall (Hauptzähler/Abgang/Maschine/etc.), foto_url, hinweise
- **sales_recommended_devices** – Geräte-Vorschlag pro Messpunkt: device_catalog_id, begründung, ist_alternativ, partner_override
- **device_catalog** – globaler Geräte-Katalog (Super-Admin pflegt): hersteller, modell, ek_preis, vk_preis, installations_pauschale, kompatibilität (jsonb: phasen, max_strom, montage, gateway_typ), beschreibung, datasheet_url
- **device_selection_rules** – Regelwerk (Super-Admin): name, bedingung (jsonb), device_catalog_id, prio
- **sales_quotes** – Angebot: projekt_id, version, geräte_summe, installation_summe, modul_summe_monatlich, total_einmalig, pdf_url, online_url, signed_at, signature_data
- **sales_quote_modules** – gewählte AICONO-Module pro Angebot (referenziert ALL_MODULES + module_prices)

RLS: nur Vertriebspartner (neue Rolle `sales_partner`) und Super-Admins haben Zugriff. Public Token für Online-Angebot ohne Login.

## Features im Detail

### Erfassungs-Flow (Beides kombiniert)
- **Wizard-Skelett**: Projekt → Liegenschaft → Verteilung hinzufügen → Messpunkt hinzufügen
- **KI-Foto-Analyse** pro Verteilung (Edge Function `sales-analyze-cabinet`):
  - Gemini 2.5 Pro Vision analysiert Foto vom Schaltschrank
  - Erkennt: Anzahl Sicherungen, Phasen, freie Hutschienen-Plätze, vermutete Hauptzähler-Position
  - Schlägt Messpunkte mit Bezeichnung, Phasen, Strombereich vor
  - Partner sieht Vorschläge, kann annehmen/anpassen/löschen
- **QR-/Foto-Scan** für Bestandszähler (Zählernummer-Erkennung über Gemini Vision)

### Geräte-Empfehlung (Hybrid)
- Edge Function `sales-recommend-devices`:
  1. **Regelbasiert**: matche Messpunkt-Eigenschaften gegen `device_selection_rules` (z. B. "3-phasig + ≤63A + Hutschiene → Shelly Pro 3EM")
  2. **KI-Fallback** (nur wenn keine Regel matcht): Gemini bekommt Messpunkt + verfügbaren Katalog → Vorschlag mit Begründung
  3. Speichert Empfehlung in `sales_recommended_devices`
- Partner kann Gerät überschreiben; Override wird gespeichert

### Modul-Auswahl
- Liste aller `ALL_MODULES` mit Preisen aus `module_prices` (industry vs. standard je nach Kundentyp)
- Modul-Bundles aus `module_bundles` als Quick-Auswahl
- Live-Berechnung der monatlichen Gebühr

### Angebots-Output (Beides + Mandanten-Vorbereitung)
- Edge Function `sales-generate-quote`:
  - Generiert PDF (jsPDF mit AICONO-Branding) → speichert in neuem Bucket `sales-quotes` (privat)
  - Erstellt `public_token`, Online-Angebot erreichbar unter `/sales/quote/:token` (kein Login, mobil-optimiert, Module ein/aus toggelbar)
  - QR-Code im PDF zum Online-Angebot
- Bei Annahme (Online-Signatur oder Partner markiert "accepted"):
  - Edge Function `sales-convert-to-tenant`: legt Tenant + Liegenschaft + Etagen + Verteilungen (als integrations) + Messpunkte (als meters) + Modul-Aktivierung an
  - Status `converted`, Übergabe an Onboarding/Installation

### Super-Admin-Bereich (neue Seiten)
- `/super-admin/sales/catalog` – Geräte-Katalog CRUD
- `/super-admin/sales/rules` – Auswahl-Regeln CRUD
- `/super-admin/sales/projects` – Übersicht aller Vertriebsprojekte (Pipeline-Ansicht)
- `/super-admin/sales/partners` – Partner-Verwaltung (User-Zuordnung Rolle `sales_partner`)

### Vertriebspartner-Bereich (neu)
- `/sales` – Projekt-Liste (eigene Projekte)
- `/sales/new` – Wizard
- `/sales/:id` – Projekt-Detail mit allen Verteilungen/Messpunkten/Geräten
- `/sales/:id/quote` – Angebot generieren

## Voraussichtliche Edge Functions
- `sales-analyze-cabinet` (Foto → Messpunkt-Vorschläge, Gemini Vision)
- `sales-recommend-devices` (Messpunkte → Geräte-Empfehlung, Regeln + KI-Fallback)
- `sales-generate-quote` (PDF + Online-Token)
- `sales-convert-to-tenant` (Angebot → Mandant-Anlage)

## Implementierungs-Reihenfolge

1. **Datenmodell**: Migration für alle neuen Tabellen + Rolle `sales_partner` + RLS
2. **Super-Admin-Katalog**: Geräte-Katalog + Auswahl-Regeln pflegen (damit Tool später echte Daten hat)
3. **Sales-PWA-Skelett**: `/sales` Routing, Layout, Projekt-CRUD
4. **Wizard**: Liegenschaft → Verteilung → Messpunkt erfassen (manuell zuerst)
5. **KI-Foto-Analyse**: Edge Function + UI-Integration
6. **Geräte-Empfehlung**: Edge Function + UI
7. **Modul-Auswahl**: Re-use `useModulePrices` / `useModuleBundles`
8. **Angebots-Generierung**: PDF + Online-Token + öffentliche Quote-Seite
9. **Mandanten-Konvertierung**: Edge Function + Übergabe-Workflow
10. **Mobile-Optimierung & PWA-Manifest** (optional, nur Add-to-Homescreen, kein Service Worker)

## Out of Scope (Phase 2)
- Digitale Signatur mit Rechtskraft (Phase 1: einfache Bestätigung + E-Mail)
- Offline-Modus während Begehung (Phase 2: IndexedDB-Cache)
- Mehrere Angebots-Varianten parallel pro Projekt
- Automatische Lieferanten-Bestellung der Geräte

## Klärungs-Punkt vor Implementierung
Da dies sehr umfangreich wird, schlage ich vor in **5 separaten Iterationen** umzusetzen (Datenmodell+Katalog → Wizard → KI → Angebot → Konvertierung). Die erste Iteration legt die Grundlage; jede weitere ist sofort testbar.

