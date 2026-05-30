# Audit & Fix-Plan: Remote-Support zeigt falsche Tenant-Daten

## 1. Ursache (kurz erklärt)

Beim Remote-Support tauscht `useTenant` zwar den aktiven Tenant aus (`getSupportViewTenantId()`), aber:

- **RLS schützt nichts gegen Super-Admins.** Policies erlauben dem `super_admin` global Zugriff auf alle Tenants — daher liefern Abfragen ohne expliziten Tenant-Filter alle Datensätze tenantübergreifend (z. B. 626,43 kWh / 28 Sessions im Screenshot = Summe über alle Tenants).
- **React-Query-Caches sind nicht tenant-aware.** Wo `tenant.id` nicht im `queryKey` steht, bleiben beim Wechsel in/aus der Support-Sicht alte Daten stehen.
- Es existiert bereits `useTenantQuery` als zentrale Lösung, wird aber nur in **4 von 44** Hooks benutzt.

## 2. Vollständiger Befund (Code-Audit)

### A) Hooks ohne jeden Tenant-Filter (kritisch — werden 1:1 im Super-Admin geleakt)

| Hook | `from()`-Aufrufe | Tenant-Filter | tenant.id im queryKey |
|---|---|---|---|
| `useChargePoints` | 10 | **0** | **nein** |
| `useChargingSessions` | 1 | **0** | **nein** |
| `useChargingUsers` | 6 | **0** | **nein** |
| `useChargingTariffs` | 4 | **0** | **nein** |
| `useChargingInvoices` | 2 | **0** | **nein** |
| `useChargerModels` | 3 | **0** | **nein** |
| `useChargePointAccessControl` | 1 | **0** | **nein** |
| `useChargePointConnectors` | 1 | **0** | **nein** |
| `useReportSchedules` | 3 | **0** | **nein** |
| `useTaskAttachments` | 2 | **0** | **nein** |
| `useEmailTemplates` | 1 | **0** | **nein** |
| `useLocationEnergySources` | 3 | **0** | **nein** |
| `useOfflineReadings` | 1 | **0** | **nein** |
| `useBenchmarks` | 1 | **0** | **nein** |
| `useBackups` | 1 | **0** | **nein** |
| `usePpaDocuments` | 1 | **0** | **nein** |
| `useCustomRoles` | 4 | **0** | **nein** |
| `useAlertRules` | 3 | (über TQ) | **nein** |

### B) Hooks mit teilweisem Filter (einzelne Abfragen lecken)

| Hook | `from()` | Filter | Anmerkung |
|---|---|---|---|
| `usePpaContracts` | 8 | 3 | 5 Reads ungefiltert |
| `useEnergyCommunities` | 11 | 4 | 7 Reads ungefiltert |
| `useMeters` | 5 | 1 | Hauptpunkt, kritisch fürs Dashboard |
| `useCommunityContracts` | 4 | 2 | |
| `useCommunityOperations` | 4 | 1 | |
| `useEnergyMeasures` | 2 | 1 | |
| `useCopilotProjects` | 2 | 1 | |

### C) Pages/Components mit direktem Supabase-Zugriff ohne Tenant-Filter

Tenant-relevant (müssen migriert werden):
- `src/pages/ChargingApp.tsx` (PWA)
- `src/pages/GettingStarted.tsx`
- `src/components/dashboard/FloorPlanDashboardWidget.tsx`
- `src/components/locations/EditMeterDialog.tsx`
- `src/components/locations/ReplaceDeviceDialog.tsx`
- `src/components/integrations/SmartMeterImport.tsx`
- `src/components/energy-sharing/CommunityWizard.tsx`
- `src/components/settings/TenantInfoSettings.tsx`
- `src/components/settings/WeekStartSetting.tsx`

Bereits korrekt scoped (Super-Admin-Globalansicht — bewusst nicht filtern):
- alle `src/pages/SuperAdmin*.tsx` außer Remote-Support
- `src/components/super-admin/*`
- `src/components/sales/*` (Vertriebsbereich, ebenfalls global)

## 3. Lösungsansatz (3 Stufen, in dieser Reihenfolge)

### Stufe 1 — Sofortmaßnahme: Cache-Reset bei Support-Sicht-Wechsel
**Eine Datei:** `src/App.tsx` (oder `src/main.tsx`, dort wo der `QueryClient` lebt).

Listener auf `onSupportViewChanged()` registrieren → bei jedem Ein-/Austritt aus Remote-Support `queryClient.clear()` aufrufen. Dadurch fallen alle gecachten Daten der falschen Sicht sofort weg, und alle Hooks laden frisch.

**Wirkung:** Beseitigt alle Probleme, die durch **gecachte Daten** entstehen (Punkt 2 oben). Behebt das eigentliche Leck (RLS-Bypass des Super-Admin) noch nicht.

### Stufe 2 — Daten-Leak schließen: zentrale Hooks auf `useTenantQuery` migrieren

Pro Hook gleicher Patch:
1. `useTenant` (oder `useTenantQuery`) importieren.
2. `queryKey` um `tenant?.id` erweitern.
3. `enabled: !!tenant?.id` setzen.
4. SELECT-Query mit `.eq("tenant_id", tenant.id)` ergänzen — bei vorhandenem `useTenantQuery` lieber direkt `from("tabelle")` aus dem Helper benutzen.
5. Realtime-Subscriptions ggf. auf `filter: tenant_id=eq.<id>` einschränken.

**Reihenfolge nach Sichtbarkeit/Schaden:**

- **Phase 2a (Ladeinfrastruktur — bestätigt im Screenshot):**
  `useChargePoints`, `useChargingSessions`, `useChargingUsers`, `useChargingTariffs`, `useChargingInvoices`, `useChargerModels`, `useChargePointAccessControl`, `useChargePointConnectors`
- **Phase 2b (Dashboard/Energiedaten):**
  Restliche ungefilterte Abfragen in `useMeters`, `useEnergyCommunities`, `useEnergyMeasures`, `useLocationEnergySources`, `useOfflineReadings`, `useBenchmarks`, `usePpaContracts`, `usePpaDocuments`
- **Phase 2c (Admin/Reports/Communications):**
  `useReportSchedules`, `useTaskAttachments`, `useEmailTemplates`, `useBackups`, `useAlertRules`, `useCustomRoles`, `useCopilotProjects`, `useCommunityContracts`, `useCommunityOperations`
- **Phase 2d (Pages/Components aus Liste C):** alle 9 oben genannten Dateien analog umstellen.

Keine RLS-Änderungen, keine Backend-Änderungen, keine neuen Felder.

### Stufe 3 — Schutz vor Wiederholung
- Kurzer Vitest, der für jede Tabelle mit `tenant_id`-Spalte sicherstellt, dass kein Hook unter `src/hooks` ein `supabase.from("<tabelle>").select(...)` ohne `.eq("tenant_id"` oder `useTenantQuery` enthält.
- Eintrag in `mem://technical/architecture/multi-tenancy-core` ergänzen: „Im Remote-Support sieht der Super-Admin RLS-bedingt alle Tenants — Frontend muss IMMER explizit auf `tenant.id` filtern UND `tenant.id` in jeden `queryKey` aufnehmen."

## 4. Out of scope
- Keine RLS-Policy-Änderungen (Super-Admin soll bewusst global lesen können).
- Keine Änderungen am Edge-Function-Verhalten.
- Keine Refactorings über das Tenant-Scoping hinaus.

## 5. Vorgehen für die Umsetzung
1. **Erst Stufe 1 umsetzen** (1 Datei, sofort wirksam) und vom Nutzer in der Live-Umgebung validieren.
2. Nach Bestätigung **Stufe 2 phasenweise** (2a → 2b → 2c → 2d), nach jeder Phase Validierung im Remote-Support.
3. **Stufe 3** zuletzt als Absicherung.

Bei jeder Phase: Build + Smoke-Test im Remote-Support für genau die in der Phase migrierten Bereiche.