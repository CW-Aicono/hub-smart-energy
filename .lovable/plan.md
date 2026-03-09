

# Plan: Massive Test-Erweiterung auf 50%+ Code-Coverage

## Ist-Zustand

| Bereich | Dateien | Getestet | Coverage |
|---------|---------|----------|----------|
| `src/lib/` (10 Dateien) | 10 | 7 | ~70% |
| `src/hooks/` (68 Dateien) | 68 | 8 | ~12% |
| `src/components/` (~100 Dateien) | ~100 | 0 | 0% |
| `src/pages/` (40 Dateien) | 40 | 0 | 0% |
| `src/contexts/` | 1 | 0 | 0% |
| `src/i18n/` | 2 | 0 | 0% |
| Edge Functions (30+) | 30+ | 0 | 0% |
| **Gesamt** | **~250** | **16** | **~5-8%** |

## Strategie

Um 50%+ zu erreichen, brauchen wir ~60-70 neue Testdateien. Die Arbeit wird in 6 Batches aufgeteilt, priorisiert nach Business-Impact und Testbarkeit.

---

### Batch 1: Lib-Funktionen vervollstandigen (3 neue Testdateien)

Reine Funktionen ohne Mocks -- schnellster Weg zu Coverage.

- **`src/lib/__tests__/gatewayRegistry.test.ts`** -- `getGatewayTypes()`, `getGatewayDefinition()`, `getEdgeFunctionName()`, Fallback bei unbekanntem Typ
- **`src/lib/__tests__/exportUtils.test.ts`** -- `downloadCSV` (Escaping, Semikolon-Trennung, BOM), `buildStackedBarChartSVG`, `buildTrendLineSVG`, `buildTrafficLightSVG` (DOM-Mock fur `window.open`)
- **`src/lib/__tests__/utils.test.ts`** -- `cn()` Merge-Verhalten

### Batch 2: Kritische Hooks (12 neue Testdateien)

Pattern: Supabase-Client mocken (wie in `useMeters.test.tsx`), CRUD-Operationen + Fehlerbehandlung testen.

- **useLocations** -- fetch, addLocation, updateLocation, deleteLocation, tree-building
- **useChargePoints** -- fetch, add/update/delete mit Realtime-Subscription
- **useChargingSessions** -- fetch mit/ohne chargePointId, Realtime
- **useIntegrations** -- fetch, create, update, delete, Kategorie-Laden
- **useLocationIntegrations** -- addIntegration, testConnection, removeIntegration
- **useFloors** -- CRUD
- **useCustomRoles** -- CRUD
- **useTasks** -- fetch, create, update, archive
- **useAlertRules** -- CRUD
- **useEnergyPrices** -- fetch, upsert
- **usePvForecast** -- fetch settings, upsert, trigger forecast
- **useChargingTariffs** -- CRUD

### Batch 3: Kontext & Utilities (4 neue Testdateien)

- **`src/contexts/__tests__/DemoMode.test.tsx`** -- `useDemoMode()` gibt true/false je nach Route, `useDemoPath()` Prefix-Verhalten
- **`src/i18n/__tests__/getT.test.ts`** -- Sprachauswahl aus localStorage, Fallback auf `de`, fehlende Keys
- **`src/i18n/__tests__/translations.test.ts`** -- Alle Keys haben de + en Eintrage (Konsistenzcheck)
- **`src/hooks/__tests__/useTranslation.test.tsx`** -- Hook liefert korrekten String je Sprache

### Batch 4: Komponenten-Tests (15 neue Testdateien)

Render-Tests mit gemockten Hooks. Fokus auf Formulare und kritische UI-Logik.

- **ModuleGuard** -- Redirect bei gesperrtem Modul, Render bei erlaubtem
- **CookieConsent** -- Consent-Banner anzeigen/ausblenden
- **NavLink** -- Active-State, Demo-Prefix
- **AddLocationDialog** -- Formularvalidierung, Submit-Handler
- **AddMeterDialog** -- Pflichtfelder, Energietyp-Auswahl
- **EditIntegrationDialog** -- Config-Felder dynamisch je Gateway-Typ
- **IntegrationCard** -- Status-Anzeige, Enable/Disable Toggle
- **LocationTree** -- Baumstruktur-Rendering, Auswahl-Callback
- **TaskCard** -- Status-Badge, Priority-Anzeige, Click-Handler
- **CreateTaskDialog** -- Validierung, Submit
- **BulkActionsToolbar** -- Button-States bei Auswahl
- **ChargePointQrCode** -- QR-Code Rendering
- **UserManagement** -- Tabelle rendert User-Daten
- **RoleCard** -- Permissions-Darstellung
- **ProfileSettings** -- Form-Rendering, Validierung

### Batch 5: Seiten-Smoke-Tests (10 neue Testdateien)

Jede Seite mockt ihre Hooks und pruft ob sie ohne Crash rendert + Hauptelemente enthalt.

- **Auth.tsx** -- Login/Signup Form vorhanden
- **Locations.tsx** -- Titel, Add-Button
- **ChargingPoints.tsx** -- Tabelle/Liste rendert
- **Integrations.tsx** -- Integrationskarten
- **Tasks.tsx** -- Task-Board/Liste
- **Settings.tsx** -- Tabs vorhanden
- **Admin.tsx** -- User-Management sichtbar
- **EnergyData.tsx** -- Chart/Tabelle
- **DashboardContent.tsx** -- Widget-Container
- **NotFound.tsx** -- 404-Meldung

### Batch 6: Edge Function Integration Tests (8 neue Testdateien)

Deno-Tests die den deployed Edge Function Endpunkt aufrufen (via `supabase--test_edge_functions`).

- **pv-forecast** -- Anfrage mit/ohne location_id, Antwortformat validieren
- **gateway-ingest** -- Auth-Validierung (401 ohne Key), Reading-Insert
- **fetch-spot-prices** -- Antwortformat
- **anomaly-detection** -- Antwortformat
- **invite-tenant-admin** -- Fehlende Parameter -> Fehler
- **delete-user** -- Auth-Check
- **api-key-info** -- Antwortformat
- **meter-ocr** -- Fehlende Bilddaten -> Fehler

---

## Technische Details

### Mock-Muster (Frontend Hooks)

Alle Hook-Tests folgen dem etablierten Pattern aus `useMeters.test.tsx`:

```typescript
const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn(), auth: {} }
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("../useTenantQuery", () => ({
  useTenantQuery: () => ({ tenantId: "t-1", ready: true, from: vi.fn(), insert: vi.fn() })
}));
```

### Komponenten-Test-Muster

```typescript
vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({ locations: [mockLocation], loading: false })
}));
render(<MemoryRouter><Locations /></MemoryRouter>);
expect(screen.getByText("Standorte")).toBeInTheDocument();
```

### Edge Function Test-Muster (Deno)

```typescript
import "https://deno.land/std@0.224.0/dotenv/load.ts";
const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
Deno.test("pv-forecast returns 400 without location_id", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pv-forecast`, {
    method: "POST", body: JSON.stringify({}),
    headers: { "Authorization": `Bearer ${ANON_KEY}`, "Content-Type": "application/json" }
  });
  const body = await res.text();
  assertEquals(res.status, 400);
});
```

## Erwartete Coverage nach Umsetzung

| Bereich | Vorher | Nachher |
|---------|--------|---------|
| `src/lib/` | ~70% | ~95% |
| `src/hooks/` | ~12% | ~55% |
| `src/components/` | 0% | ~15% |
| `src/pages/` | 0% | ~25% |
| `src/contexts/` + `src/i18n/` | 0% | ~80% |
| Edge Functions | 0% | ~25% |
| **Gesamt** | **~5-8%** | **~50-55%** |

## Umsetzungsreihenfolge

Batch 1 -> 3 -> 2 -> 4 -> 5 -> 6 (schnelle Wins zuerst, dann aufsteigend nach Komplexitat)

**Gesamtaufwand: ~52 neue Testdateien, ~3000-4000 Zeilen Testcode**

