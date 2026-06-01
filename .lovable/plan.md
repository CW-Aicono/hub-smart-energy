## Ziel

1. **Partner** (Rolle `partner_admin`) bekommt unter `/partner/sales/catalog` und `/partner/sales/rules` dieselben Verwaltungsseiten wie der Super-Admin – aber gescoped auf seine `partner_id`.
2. **Globaler Katalog bleibt sichtbar** (read-only) und der Partner kann für **jeden globalen Artikel einen eigenen Preis** hinterlegen (Override-Preis), zusätzlich eigene Artikel und Auswahl-Regeln pflegen.
3. **Sales-Scout-PWA** läuft unter eigener Subdomain `**sales.aicono.org**` mit eigenem Manifest, Standalone-Layout, Safe-Area oben/unten und Tablet-/Smartphone-Optimierung.

---

## 1. Datenmodell (Migration)

```sql
-- device_catalog: Owner-Felder
ALTER TABLE public.device_catalog
  ADD COLUMN partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE,
  ADD COLUMN owner_scope text NOT NULL DEFAULT 'global'
    CHECK (owner_scope IN ('global','partner'));
CREATE INDEX idx_device_catalog_partner ON public.device_catalog(partner_id);

-- device_compatibility: Owner-Felder (für Regeln)
ALTER TABLE public.device_compatibility
  ADD COLUMN partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE,
  ADD COLUMN owner_scope text NOT NULL DEFAULT 'global'
    CHECK (owner_scope IN ('global','partner'));

-- Partner-spezifische Preis-Overrides auf globale Artikel
CREATE TABLE public.device_catalog_partner_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_catalog_id uuid NOT NULL REFERENCES public.device_catalog(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  ek_preis numeric(10,2),
  vk_preis numeric(10,2),
  installations_pauschale numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_catalog_id, partner_id)
);
-- GRANT + RLS: Partner sieht/ändert nur eigene Overrides; super_admin alles.
```

**RLS (Kurzfassung):**

- `device_catalog` SELECT: alle authenticated dürfen `owner_scope='global'` ODER eigene `partner_id`.
- `device_catalog` INSERT/UPDATE/DELETE: super_admin (global) oder `partner_admin` (nur eigene `partner_id`, `owner_scope='partner'` erzwungen via Trigger).
- Analog `device_compatibility`.
- `device_catalog_partner_pricing`: nur eigener Partner + super_admin.

Edge-Function `sales-suggest-accessories` und Preisermittlung in Quote-Generierung: beim Laden von `vk_preis`/`installations_pauschale` Override per `partner_id` mergen (LEFT JOIN auf `device_catalog_partner_pricing`).

---

## 2. Frontend – Partner-Backend

Neue Seiten unter `src/pages/partner/`:

- `PartnerSalesCatalog.tsx` – wiederverwendete Komponente aus `SuperAdminSalesCatalog`, parametrisiert mit `scope: 'partner' | 'global-readonly-with-override'`.
- `PartnerSalesRules.tsx` – analog zu `SuperAdminSalesRules`.

**Refactor:** Logik aus `SuperAdminSalesCatalog.tsx` und `SuperAdminSalesRules.tsx` in wiederverwendbare Komponenten extrahieren (`SalesCatalogManager`, `SalesRulesManager`) mit Prop `scope`. Filter & Insert-Defaults setzen `owner_scope`/`partner_id` entsprechend.

Globale Artikel werden in der Partner-Ansicht angezeigt mit:

- Read-only Basisdaten
- Inline-Editor für Override-Preise (ek/vk/Pauschale) → schreibt in `device_catalog_partner_pricing`
- Visueller Badge „Global" vs. „Eigen"

Routen in `src/App.tsx`:

```
/partner/sales/catalog → PartnerLayout > PartnerSalesCatalog
/partner/sales/rules   → PartnerLayout > PartnerSalesRules
```

Navigation in `PartnerLayout` ergänzen (Sales-Scout-Gruppe mit zwei Unterpunkten).

---

## 3. Sales-Scout PWA

**Subdomain `sales.aicono.org`:**

- DNS A/AAAA-Record auf den Hetzner-Server (Anleitung im Plan-Ergebnis).
- Traefik/Caddy-Routing: zusätzlicher Host-Eintrag für `sales.aicono.org` → gleicher Vite-Build, gleicher Origin-Server. Anleitung als Markdown in `docs/DEPLOYMENT.md` ergänzen.
- React-Boot prüft `window.location.hostname === 'sales.aicono.org'` und redirected `/` → `/sales` automatisch (oder rendert direkt SalesLayout ohne Tenant-Chrome).

**Manifest:**

- `public/manifest-sales.json`: `start_url`/`scope` auf `/` setzen wenn Subdomain dediziert, `display: standalone`, Theme #0f172a (bereits vorhanden).
- In `SalesLayout` wird Manifest bereits dynamisch geladen – Logik anpassen: bei Subdomain immer aktiv.

**Tablet/Mobile-Optimierung + Safe-Area:**

- `index.html`: `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` (`viewport-fit=cover` ist neu).
- `SalesLayout` Header bekommt:
  - `padding-top: env(safe-area-inset-top)`
  - `padding-left/right: env(safe-area-inset-left/right)`
  - sticky Header bleibt unter Notch.
- Touch-Targets ≥ 44px, größere Buttons, FAB bereits vorhanden.
- Landscape-Layout für Tablets (max-width 1024px statt 768px), 2-spaltiges Formular auf Tablet.

**Funktional unverändert** – nur Layout-Optimierung; Daten kommen weiterhin aus `sales_projects`, `sales_distributions`, `sales_measurement_points`. RLS-Erweiterung sorgt automatisch dafür, dass Monteur (partner_member) den Partner-Katalog + globalen Katalog mit eigenen Preisen sieht.

---

## 4. Reihenfolge der Umsetzung

1. **Migration** (Schema + RLS + GRANT) – muss vom Nutzer freigegeben werden.
2. Refactor Super-Admin-Seiten → wiederverwendbare Komponenten.
3. Partner-Seiten + Routen + Navigation.
4. Edge-Function `sales-suggest-accessories` + Quote-Generator: Preis-Override-Merge.
5. PWA: Manifest, Safe-Area, viewport-fit, Subdomain-Detection im Frontend.
6. Schritt-für-Schritt-Anleitung (DE, laienverständlich) für DNS + Traefik-Subdomain in `docs/DEPLOYMENT.md`.

---

## Offen / Bestätigung erwünscht

- **DNS/Traefik**: Soll ich die exakte Anleitung im selben Schritt schreiben, oder erst nach Cloud-Implementierung als separates Setup-Dokument?
- **Partner-Mitarbeiter ohne `partner_admin**`: Sollen sie den Katalog nur lesen oder auch eigene Artikel/Regeln pflegen dürfen? (Vorschlag: nur `partner_admin` darf pflegen, alle Partner-Member dürfen lesen.)  
  
Antworten:  
- DNS/Traefik: Anleitung im selben Schritt schreiben  
- Partner-Mitarbeiter: Partner-Admin soll Rollen und Rechte für seine Mitarbeiter anlegen und verwalten können: Artikel/Regeln pflegen ja/nein, neuen Tenant anlegen ja/nein, Abrechnung ja/nein, Sales-Scout nutzen ja/nein