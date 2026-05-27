# Iteration D — Community-Marktplatz + Mitglieder-PWA

Ziel: Energy-Sharing nach außen öffnen (öffentlicher Marktplatz mit Beitritt) und nach innen (PWA für Mitglieder mit Lese-Zugriff auf Allokation + Rechnungen).

## Stufe 1 — Marktplatz Backend (DB + Edge Function)

**Migration:**
- `community_marketplace_listings` (community_id, title, short_description, region_plz, max_members, price_ct_kwh, feed_in_ct_kwh, hero_image_url, is_public, slug uniq, view_count)
- `community_join_requests` (listing_id, community_id, name, email, phone, address, plz, message, status [new|accepted|rejected|withdrawn], rejection_reason)
- RLS: Tenant verwaltet eigene; öffentliche Selects über Edge Function (SECURITY DEFINER RPC oder service_role)
- Storage Bucket `community-marketplace` (public read) für hero images
- Trigger: `view_count++` via RPC

**Edge Function `community-marketplace-public`** (verify_jwt=false):
- `GET /listings` — alle is_public=true Listings (slug, title, region, kw verfügbar, Preis)
- `GET /listings/:slug` — Detail + Community-Stats (Mitglieder, kW installiert)
- `POST /join-request` — Beitritts-Antrag (Rate-Limit per IP, Zod-Validierung, PLZ-Plausi)

## Stufe 2 — Marktplatz Frontend (öffentlich + Backoffice)

**Öffentliche Seiten** (kein Login):
- `/sharing/marktplatz` — Kachelübersicht mit PLZ-Filter
- `/sharing/marktplatz/:slug` — Detailseite (Karte, Hero, Kennzahlen, Beitritts-Formular)

**Backoffice-Tab in `EnergySharing.tsx`:** „Marktplatz"
- Listing erzeugen/editieren (Toggle public/draft, Hero-Upload, Slug-Generator)
- Eingegangene Join-Requests prüfen → akzeptieren erzeugt automatisch `community_members` Eintrag (status=invited)

## Stufe 3 — Mitglieder-PWA Grundgerüst

- `public/manifest-sharing.json` (name „Meine Energie-Community", standalone, scope `/mein-sharing/`)
- Icons (reuse aicono Brand)
- Manifest-only PWA (keine Service Worker — siehe Projekt-Policy)
- Routen unter `/mein-sharing/*`:
  - `/mein-sharing/login` (reuse existing Supabase Auth, Mail-Magic-Link)
  - `/mein-sharing/dashboard` — kW eingebracht, kWh alloziert (Monat), Tagesverlauf
  - `/mein-sharing/rechnungen` — Liste eigener Rechnungen + PDF-Download
  - `/mein-sharing/onboarding` — IDs nachreichen (MaLo/MeLo)
- Mitglied wird per `community_members.email = auth.users.email` erkannt (RLS-Policy existiert bereits für `community_member_invoices`)

## Stufe 4 — PWA Datenflüsse + Install-Seite

- `sharingClient.ts` Hook: lädt eigenes Mitglied, eigene Allokationen 15-min (aggregiert auf Tag), eigene Rechnungen
- Read-only Dashboard mit Recharts (Tageskurve kW)
- `/mein-sharing/install` — Anleitung „Zum Startbildschirm hinzufügen" (iOS/Android), Manifest-Verlinkung
- Out of scope: Push, Chat, Self-Service-Vertragsänderung

## Risiken / Annahmen

- Rate-Limiting für Public-Endpoint: einfache IP+Email Drossel in Edge Function (Memory-Map, 5/min) — produktiv später per pg-Tabelle
- Slug-Kollisionen: UNIQUE-Constraint + Server-seitige Fallback-Suffixe
- PWA-Install funktioniert nur in published-Version, nicht im Lovable-Preview-Iframe (Projekt-Policy)

## Reihenfolge

Stufe 1 (DB + Public Edge Function) → User testet API → Stufe 2 (Public Pages + Backoffice) → Stufe 3 (PWA Skeleton) → Stufe 4 (Daten + Install). Nach jeder Stufe Pause für Test.

**Jetzt beginne ich mit Stufe 1.**
