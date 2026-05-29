# PPA-Management Phase 1 – Restarbeiten

DB, Storage, Permissions, Hooks (`usePpaContracts`, `usePpaDocuments`), Preisformel-Engine und die Übersichtsseite `src/pages/PPA.tsx` sind bereits live. Jetzt fehlen Wizard, Detail-View und die Einbettung ins Hauptsystem.

## 1. Wizard `src/pages/PPAWizard.tsx`

7-Step Flow, ein Step pro Bildschirm, Fortschrittsbalken oben, "Zurück / Weiter / Entwurf speichern":

1. **Typ wählen** – On-site / Off-site (CardSelect)
2. **Stammdaten** – Vertragsname, Counterparty, Laufzeit (Start/Ende), Vertragsnummer
3. **Preismodell** – Auswahl `fixed | spot_plus_premium | floor_cap | index_linked` + dynamische Felder, Live-Validierung via `validatePriceFormula` aus `src/lib/ppa/priceFormula.ts`, Live-Vorschau mit aktuellem EPEX-Spot (Re-use `fetch-spot-prices`)
4. **On-site Config** (nur On-site): Gebäude (`locations`), Erzeugungs-Zähler (PV-Meter), Volumenmodell (`as_produced` / `as_consumed` / `fixed_share`)
5. **Verbrauchs-Zähler** (nur On-site): Multi-Select aus `meters`, schreibt in `ppa_consumption_meters`
   - **5a. Mieterstrom-Bridge**: optional `mieterstrom_settings_id` setzen (Dropdown aus `tenant_electricity_settings`)
6. **Off-site Config** (nur Off-site): Lieferpunkt, jährliches Volumen (MWh), Profil (`baseload` / `solar` / `wind` / `custom`), Herkunftsnachweise (GoO) toggle
7. **Dokumente & Review** – PDF-Upload (Vertrag, GoO, Anhänge) via `usePpaDocuments`, finaler Review, "Als Entwurf speichern" oder "Aktivieren" (letzteres nur mit `ppa.activate`)

Validierung pro Step via Zod-Schemas, Wizard-State in `useReducer`.

## 2. Detail-View `src/pages/PPADetail.tsx`

Header mit Vertragsname, Status-Badge, Counterparty, Quick-Actions (Bearbeiten, Status ändern, Löschen wenn `draft`).

Tabs:
- **Übersicht** – Stammdaten, Preisformel (lesbar formatiert), Laufzeit, Mieterstrom-Bezug (Link), KPI-Karten (Vertragsvolumen, Restlaufzeit)
- **Konfiguration** – On-site oder Off-site Detail-Card
- **Verbrauchs-Zähler** (On-site) – Tabelle aus `ppa_consumption_meters`, hinzufügen/entfernen
- **Dokumente** – Liste aus `ppa_documents` mit Download via `secureStorage`-Proxy, Upload, Hash-Anzeige
- **Historie** – `ppa_status_history` chronologisch, mit User/Email

Status-Wechsel-Dialog mit erlaubten Übergängen (clientseitig gespiegelt aus `log_ppa_status_change`-Trigger).

## 3. Integration

- **Routing** `src/App.tsx`: `/ppa`, `/ppa/new`, `/ppa/:id` – als statische Imports (HMR-Stability-Policy), gewrappt in `ProtectedRoute` + `ModuleGuard moduleKey="ppa"`
- **Sidebar** `src/components/DashboardSidebar.tsx`: Eintrag "PPA-Management" unter Energy-Bereich, Icon `FileSignature`, sichtbar wenn `ppa.view`
- **ModuleGuard** – `ppa` zu `MODULE_KEYS` und Module-Mapping hinzufügen (Display-Name "PPA-Management")
- **i18n** – Keys in `de`, `en`, `es`, `nl` unter `ppa.*` (overview, wizard, detail, status, priceModel, errors)
- **Zahlenformat** – alle Preise/Volumen via `toLocaleString("de-DE")`

## Technische Details

- **Hooks-Erweiterungen**: `usePpaContracts` bekommt `createDraft`, `updateContract`, `changeStatus`, `deleteContract`. Neuer `usePpaStatusHistory(contractId)`.
- **Mieterstrom-Bridge**: nur FK-Set, keine Datenduplizierung. Settings werden im Detail nur referenziert/verlinkt, nicht editiert.
- **Tenant-Scope**: alle Queries über `useTenantQuery` bzw. `.eq("tenant_id", tenant.id)`.
- **Storage**: Uploads in `ppa-documents/{tenant_id}/{contract_id}/{filename}`, RLS via `split_part`.
- **Audit**: Status-Trigger schreibt automatisch in `ppa_status_history`, kein Client-Code nötig.

## Phase 2 – Status

- [x] **Settlement-Engine** – Tabelle `ppa_settlements`, Edge `ppa-settlement-calculate` (stündliche Aggregation × Preisformel × EPEX-Spot), monatlicher Cron (2. um 03:15), Tab „Abrechnungen" im PPADetail mit Manuell-Berechnen + Status-Workflow (draft → finalized → invoiced)
- [ ] Alerts & Monitoring (`ppa-alert-check`)
- [ ] Report-Generator (`ppa-report-generate`)
- [ ] PPAFleetCard fürs Dashboard
- [ ] Energy-Sharing-Verknüpfung + erweiterter GoO-Workflow
