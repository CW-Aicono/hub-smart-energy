# Einheitliches Tabellen-Muster auf Tenant-Ebene

## Zielbild (Vorlage: Lade-Nutzer)

- Erste Spalte (Name/Bezeichnung) ist ein Text-Button: Klick öffnet direkt den Bearbeiten-Dialog (`hover:underline`, Fokus-Ring, kein Icon).
- Letzte Spalte: ein einziger Drei-Punkte-Button (`MoreHorizontal`) mit Dropdown, das **alle** Aktionen enthält — Bearbeiten, Duplizieren, QR-Code, Archivieren/Wiederherstellen, Sperren/Entsperren, Export, Löschen (destruktiv, unten, rot).
- Keine einzeln nebeneinanderliegenden Icon-Buttons mehr in der Aktionsspalte.
- Reine Anzeige-Tabellen ohne Aktionen bleiben unverändert.

## Gemeinsame Komponente

Neu: `src/components/ui/row-actions.tsx` mit `<RowActions items={[{ label, icon, onClick, variant?: "destructive", hidden? }]} />`.
Kapselt Dropdown, Trigger-Button, Trennlinie vor destruktiven Einträgen und `stopPropagation`. Alle Tabellen unten werden darauf umgestellt, damit Abstände, Icon-Größen und Reihenfolge überall identisch sind.

## Bestandsaufnahme — Tenant-Ebene

Bereits korrekt (Vorlage):
- `src/components/charging/ChargingUsersTab.tsx` (Nutzer, Nutzergruppen)
- `src/components/charging/BillingGroupsTab.tsx`
- `src/pages/ChargePointDetail.tsx`

Umzustellen (Aktionen vorhanden, aber als Icon-Reihe / ohne Namensklick):

| Datei | Tabelle |
| --- | --- |
| `src/components/locations/MeterManagement.tsx` | Zähler, Sensoren/Aktoren, verknüpfte Zähler (Namensklick vorhanden, Icon-Reihe ersetzen) |
| `src/pages/MetersOverview.tsx` | Zähler-Gesamtübersicht (inkl. QR-Code) |
| `src/pages/TenantElectricity.tsx` | Mieter-/Zählerzuordnung (Archivieren, Duplizieren, QR, Löschen) |
| `src/pages/Automation.tsx` | Automationen |
| `src/pages/ArbitrageTrading.tsx` | Arbitrage-Regeln |
| `src/pages/PeakShaving.tsx` | Peak-Shaving-Regeln |
| `src/pages/ChargingPoints.tsx` | Ladepunkte (Duplizieren, QR, Löschen) |
| `src/pages/ChargingBilling.tsx` | Rechnungen |
| `src/pages/ChargingReporting.tsx` | Reports (Dropdown vorhanden, Namensklick + Trigger vereinheitlichen) |
| `src/pages/ChargingAppContent.tsx` | Lade-App-Einträge (QR, Duplizieren, Archivieren) |
| `src/pages/EnergySharing.tsx` | Sharing-Teilnehmer |
| `src/components/energy-sharing/MarketplaceTab.tsx` | Angebote |
| `src/components/energy-sharing/ContractTemplatesTab.tsx` | Vertragsvorlagen |
| `src/components/charging/RoamingTab.tsx` | Roaming-Partner |
| `src/components/charging/adhoc/ProvidersPanel.tsx` | Ad-Hoc-Anbieter |
| `src/components/charging/adhoc/TerminalsPanel.tsx` | Terminals |
| `src/components/charging/adhoc/PaymentRulesPanel.tsx` | Zahlungsregeln |
| `src/components/admin/UserManagement.tsx` | Benutzer & Rollen |
| `src/components/admin/ExternalContactsManager.tsx` | Externe Kontakte |
| `src/components/energy-data/InvoicesList.tsx` | Eingangsrechnungen |
| `src/components/locations/EnergyPriceManagement.tsx` | Energiepreise |
| `src/components/settings/Co2FactorSettings.tsx` | CO2-Faktoren |
| `src/components/integrations/AiconoHubManager.tsx` | Hubs/Gateways |
| `src/components/network/NetworkDevicesTable.tsx` | Netzwerkgeräte |
| `src/components/report/MeasuresTable.tsx` | Maßnahmen |
| `src/components/sales/SalesCatalogManager.tsx` | Verkaufskatalog |
| `src/components/sales/SalesRulesManager.tsx` | Verkaufsregeln |

Ohne Änderung (reine Anzeige, keine Zeilenaktionen):
`Copilot.tsx`, `ChargingAdHocTransactions.tsx`, `OcppLogViewer.tsx`, `AuditLogList.tsx`, `SensorsDialog.tsx`, `ChargingInvoiceBulkDialogs.tsx`, `report/PropertyProfile.tsx`, `report/LocationRanking.tsx`, `report/ConsumptionTrendTable.tsx`, `dashboard/WeatherNormalizationWidget.tsx`, `energy-sharing/DataImportTab.tsx`, `energy-sharing/BillingTab.tsx`, `savings-share/SavingsShareReadOnly.tsx`.

Hinweis: Super-Admin und Partner-Portal sind nicht Teil dieses Umbaus (eigener Bereich, strikt getrennt).

## Vorgehen

1. `RowActions`-Komponente anlegen.
2. Tabellen in der obigen Reihenfolge umstellen: Namensspalte klickbar machen, Icon-Reihe durch `RowActions` ersetzen, bestehende Handler 1:1 übernehmen (keine Logikänderung).
3. Labels über die vorhandenen `t()`-Keys (`common.edit`, `common.delete`, …); fehlende Keys in DE/EN/ES/NL ergänzen.
4. Abschluss-Check: keine verbliebenen Aktions-Icon-Reihen in `<TableCell>` auf Tenant-Ebene.

## Technische Details

- Dropdown-Trigger: `Button variant="ghost" size="icon"` mit `MoreHorizontal h-4 w-4`, Spalte rechtsbündig, `DropdownMenuContent align="end"`.
- Löschen bleibt an den bestehenden Bestätigungsdialogen (`AlertDialog`) angebunden.
- Bulk-Auswahl-Leisten (z. B. MeterManagement) bleiben unverändert.
