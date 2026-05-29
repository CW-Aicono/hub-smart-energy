# PPA-Management — Umsetzungsplan

Basis: Konzept geprüft, drei Kernentscheidungen sind getroffen:

- **Mieterstrom:** PPA referenziert bestehende `tenant_electricity_settings` (keine Z.-Liste duplizieren).
- **Energy Sharing:** Keine Verknüpfung in Phase 1 (`surplus_contract_id` entfällt vorerst).
- **EPEX-Historie:** Vorhanden, Settlement kann darauf zugreifen.

Da kein expliziter Phase-1-Scope genannt wurde, schlage ich aus Credit- und Risikogründen einen klaren Schnitt vor. Wenn du in einem Rutsch alles willst, sag Bescheid — dann wird's nur teurer, nicht besser.

---

## Phase 1 — was jetzt gebaut wird

### A. Datenmodell (1 Migration)

Tabellen (alle `tenant_id`-scoped, RLS via `has_role`/`get_user_tenant_id`, GRANT für `authenticated` + `service_role`):

1. `**ppa_contracts**` — wie im Konzept, mit folgenden Anpassungen:
  - `price_formula jsonb` mit CHECK-Trigger (Pflichtschlüssel je `price_model`).
  - `mieterstrom_settings_id uuid` (FK auf `tenant_electricity_settings`, nullable) — die saubere Mieterstrom-Brücke.
  - `surplus_contract_id` **wird nicht angelegt** (Phase 2/3).
2. `**ppa_onsite_config**` — wie im Konzept, **ohne** `consumption_meter_ids uuid[]`.
3. `**ppa_consumption_meters**` — Join-Tabelle (`contract_id`, `meter_id`, `role`) statt Array. Projektkonvention.
4. `**ppa_offsite_config**` — wie im Konzept.
5. `**ppa_documents**` — wie im Konzept, mit `file_hash` (SHA-256) für Idempotenz.
6. `**ppa_status_history**` — eigener Audit-Trail (`contract_id`, `old_status`, `new_status`, `changed_by`, `changed_at`, `reason`). Wird per Trigger auf `ppa_contracts` befüllt.

`ppa_settlement_periods` wird angelegt (leer), damit Phase 2 keine Migration mehr braucht. Keine Cron-Jobs in Phase 1.

### B. Storage

- Bucket `ppa-documents` (privat).
- RLS via `split_part(name, '/', 1) = tenant_id::text` (Projekt-Standard, siehe `storage-rls-policy-logic-isolation`).
- Download über bestehenden `secureStorage`-Proxy (kein public URL).

### C. ModuleGuard & Permissions

- Neues Modul `ppa_management` in der Module-Registry.
- Permission-Codes: `ppa.view`, `ppa.manage`, `ppa.activate` (nur Admin).
- Route mit `ModuleGuard` + `useHasPermission`.

### D. UI (Tenant-Bereich, `/ppa`)

1. `**PPA.tsx**` — Übersicht mit Tabs „On-site" / „Off-site", Karten-Grid, Filter (Alle/Aktiv/Auslaufend/Entwurf), Auslauf-Alert-Banner.
2. `**PPAWizard.tsx**` — 7-Schritt-Wizard wie spezifiziert:
  - Schritt 5a (on-site): Mieterstrom-Toggle → wenn an, Dropdown bestehender `tenant_electricity_settings` (ersetzt manuelle Verbrauchszähler-Auswahl). Sonst: Multi-Select via `ppa_consumption_meters`.
  - Schritt 4: Live-EPEX-Vorschau über `useSpotPrices`.
  - Schritt 7: Speichern als `draft`.
3. `**PPADetail.tsx**` — Tabs „Übersicht", „Messdaten", „Dokumente", „Historie".
  - **„Abrechnung"-Tab wird als Placeholder gerendert** („Verfügbar nach Aktivierung der Settlement-Engine in Phase 2"). Keine Halb-Implementierung.
4. **Hooks:** `usePpaContracts`, `usePpaContract(id)`, `usePpaDocuments(id)` — alle mit `useTenantQuery`.
5. **i18n:** DE/EN/ES/NL via dynamisches `t()`. Zahlen `toLocaleString("de-DE")`.

### E. Sidebar / Routing

- Neuer Sidebar-Eintrag „PPA-Management" unter „Energie".
- Routes: `/ppa`, `/ppa/new`, `/ppa/:id`. **Statische Imports** (HMR-Stabilitätsregel).

### F. Edge Function (Phase 1, minimal)

- `**ppa-api**` — nur `validatePriceFormula` (Zod) + `getContractSummary`. Auth via `getClaims`. Keine Background-Logik.

### Phase 1 explizit NICHT enthalten (= Phase 2/3)

- `ppa-settlement-calculate` Cron + Logik
- `ppa-alert-check` Cron
- `ppa-report-generate` (PDF)
- `PPAFleetCard` Super-Admin-Widget
- `surplus_contract_id` / Energy-Sharing-Brücke
- GoO-Workflow über Basisupload hinaus

Das spart ~60% des Aufwands und liefert ein nutzbares MVP, an dem du die Datenmodell-Entscheidungen prüfen kannst, **bevor** wir die teure Settlement-Engine bauen.

---

## Technische Details

### Preisformel-Validierung (`price_formula`)

CHECK-Trigger und Zod-Schema müssen synchron sein:

- `fixed`: `price_eur_per_kwh` NOT NULL, `price_formula` NULL.
- `spot_plus_premium`: `{ base: 'epex_spot', premium: number }`.
- `floor_cap`: `{ base: 'epex_spot', floor: number, cap: number, floor <= cap }`.
- `index_linked`: `{ base: 'epex_spot', factor: number, offset: number }`.

### Status-Transitions

Erlaubte Übergänge per Trigger erzwingen:

```
draft   → active | terminated
active  → suspended | expired | terminated
suspended → active | terminated
expired   → (final)
terminated→ (final)
```

Jeder Wechsel → Eintrag in `ppa_status_history`.

### Mieterstrom-Bridge

`ppa_onsite_config.supply_model = 'mieterstrom'` setzt `ppa_contracts.mieterstrom_settings_id` voraus (CHECK). Verbrauchszähler werden in dem Fall **nicht** in `ppa_consumption_meters` doppelt geführt — der Detail-Tab „Messdaten" liest sie aus `tenant_electricity_tenant_meters`.

### Datei-Struktur

```text
src/pages/PPA.tsx
src/pages/PPADetail.tsx
src/pages/PPAWizard.tsx
src/components/ppa/
  PpaContractCard.tsx
  PpaStatusBadge.tsx
  PpaPriceModelForm.tsx
  PpaEpexLivePreview.tsx
  PpaDocumentUpload.tsx
  PpaMeterChart.tsx
  wizard/StepType.tsx, StepParties.tsx, StepTerm.tsx,
         StepPricing.tsx, StepOnsite.tsx, StepOffsite.tsx,
         StepGoo.tsx, StepDocs.tsx
src/hooks/usePpaContracts.tsx
src/hooks/usePpaContract.tsx
src/hooks/usePpaDocuments.tsx
src/lib/ppa/priceFormulaSchema.ts   (Zod, shared mit Edge)
src/lib/ppa/statusTransitions.ts
src/i18n/{de,en,es,nl}/ppa.ts
supabase/functions/ppa-api/index.ts
supabase/migrations/<timestamp>_ppa_module.sql
```

---

## Offene Frage vor Build

Du hast den Phase-1-Scope nicht beantwortet. Ich gehe oben vom **MVP-Schnitt** aus (kein Settlement, keine Cron, keine PDF). Wenn du stattdessen den **kompletten Big-Bang** willst (alle 4 Edge Functions + alle UI-Tabs voll funktional), sag das vor dem Implementieren — der Plan wird dann deutlich größer und teurer, und ich würde dringend zur Aufteilung raten.

Antworte mit „MVP starten" oder „Big Bang bauen".  
  
Antwort: MVP starten