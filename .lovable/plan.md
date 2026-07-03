## Ziel

Alle Tabellen im Projekt sollen sortierbare Spalten via der zentralen `SortableHead`/`useSortableData`-Utility (`src/components/ui/sortable-head.tsx`) nutzen. Aktuell verwenden sie **nur 4 von ~54 Tabellen** — und davon nutzen 3 lokale, inkonsistente Eigenbauten.

## Ist-Zustand

**Nutzt die zentrale `SortableHead`:**

- `src/components/locations/MeterManagement.tsx` — hat aber eine **lokale Copy** mit anderer API (`currentKey/direction/onSort`)

**Hat eigene lokale SortableHead-Komponenten (müssen migriert werden):**

- `src/pages/SuperAdminBilling.tsx`
- `src/pages/ChargingBilling.tsx` (3 Tabellen)
- `src/components/locations/MeterManagement.tsx`

**Keine Sortierung vorhanden (~50 Tabellen ohne SortableHead):**

Standort / Energie:

- `MetersOverview.tsx`, `EnergyPriceManagement.tsx`, `TenantElectricity.tsx`, `InvoicesList.tsx`, `SensorsDialog.tsx`, `NetworkDevicesTable.tsx`, `AiconoHubManager.tsx`

Charging:

- `ChargePointDetail.tsx`, `ChargingPoints.tsx`, `ChargingAppAdmin.tsx`, `ChargingUsersTab.tsx`, `BillingGroupsTab.tsx`, `RoamingTab.tsx`, `OcppLogViewer.tsx`, `ChargingInvoiceBulkDialogs.tsx`

Reports & Analyse:

- `ConsumptionTrendTable.tsx`, `LocationRanking.tsx`, `MeasuresTable.tsx`, `PropertyProfile.tsx`, `WeatherNormalizationWidget.tsx`, `Copilot.tsx`

Energy Sharing:

- `BillingTab.tsx`, `ContractTemplatesTab.tsx`, `DataImportTab.tsx`, `MarketplaceTab.tsx`, `EnergySharing.tsx`

Automation / Betrieb:

- `Automation.tsx`, `PeakShaving.tsx`, `ArbitrageTrading.tsx`, `AuditLogList.tsx`

Admin & Vertrieb:

- `UserManagement.tsx`, `ExternalContactsManager.tsx`, `SalesCatalogManager.tsx`, `SalesRulesManager.tsx`, `Co2FactorSettings.tsx`

Super-Admin:

- `SuperAdminTenants.tsx`, `SuperAdminTenantDetail.tsx`, `SuperAdminUsers.tsx`, `SuperAdminRoles.tsx`, `SuperAdminLicenses.tsx`, `SuperAdminGatewayFleet.tsx`, `SuperAdminSupport.tsx`, `SuperAdminPartners.tsx`, `SuperAdminSimulators.tsx`, `SuperAdminOcppControl.tsx`, `SuperAdminOcppFirmware.tsx`, `SuperAdminOcppIntegrations.tsx`

Partner-Portal:

- `PartnerBilling.tsx`, `PartnerMembers.tsx`, `PartnerTenants.tsx`, `PartnerTenantDetail.tsx`

## Vorgehen

### Phase 0 — Konsolidierung

1. `SortableHead` in `MeterManagement.tsx` entfernen und durch die zentrale Version ersetzen (API-Angleichung: `sort`/`onToggle` statt `currentKey/direction/onSort`).
2. Lokale `SortableHead` in `SuperAdminBilling.tsx` und `ChargingBilling.tsx` entfernen, ebenfalls auf die zentrale Version umstellen.

### Phase 1 — Standort & Energie (7 Dateien)

Höchste Nutzerpriorität, folgt direkt an das schon migrierte MeterManagement an.

### Phase 2 — Charging (8 Dateien)

### Phase 3 — Reports, Analyse & Energy Sharing (11 Dateien)

### Phase 4 — Admin, Automation & Vertrieb (9 Dateien)

### Phase 5 — Super-Admin & Partner-Portal (16 Dateien)

### Phase 6 — Verifikation

- Build durchlaufen lassen.
- Stichprobe pro Phase im Preview: Klick auf Spalten-Header prüft ASC/DESC/Neutral.
- Sicherstellen, dass paginierte/serverseitig gefilterte Tabellen (ChargingUsers, AuditLog) korrekt behandelt werden — dort ggf. serverseitiges Sort statt Client-Sort.

## Technische Details

**Migrations-Muster pro Tabelle:**

```tsx
type SortKey = "name" | "value" | "created_at";

const { sorted, sort, toggle } = useSortableData<Row, SortKey>(rows, (r, k) => {
  switch (k) {
    case "name": return r.name;
    case "value": return r.value;
    case "created_at": return new Date(r.created_at);
  }
});

// im Header:
<TableHead>
  <SortableHead label="Name" sortKey="name" sort={sort} onToggle={toggle} />
</TableHead>

// im Body: sorted.map(...) statt rows.map(...)
```

**Edge Cases:**

- Tabellen mit serverseitigem Pagination/Filter (z. B. `ChargingUsersTab`, `AuditLogList`, große Super-Admin-Listen): Sort-State an die Query weiterreichen, keine reine Client-Sortierung — sonst sortiert nur die aktuelle Seite. Diese Fälle in der jeweiligen Phase explizit prüfen.
- Tabellen mit Gruppierungen / Sub-Rows (falls vorhanden): Sortierung auf oberster Gruppen-Ebene.
- Locale-Sortierung ist bereits deutsch (`localeCompare("de", { numeric: true })`) — passt zur Core-Regel „deutsches Zahlenformat".

**Aufwand:** ~50 Dateien × ~5 min = größerer Diff, aber mechanisch. In 6 Phasen aufteilbar; jede Phase eigenständig deploybar.

## Frage vor der Umsetzung

Sollen wir **alle 6 Phasen in einem Rutsch** umsetzen (großer Diff, ein Turn), oder **phasenweise** mit Zwischen-Reviews (empfohlen, damit du Regressionen pro Bereich prüfen kannst)?  
  
Antwort: gerne in einem Rutsch umsetzen. Du schaffst das ;-)