# Super-Admin: Gesamtübersicht aller Ladepunkte

## Ziel

Der Menüpunkt "Ladepunkt anlegen" wird zu "Ladepunkte" und zeigt künftig eine mandantenübergreifende Übersicht aller Ladepunkte — aufgebaut wie die Ladepunkte-Seite im Tenant, aber ohne Mandantenfilter. Der bestehende Anlage-Wizard bleibt erhalten und wird über einen Button auf dieser Seite geöffnet.

## Was der Super-Admin sieht

- Kopfzeile "Ladepunkte" mit Kurzbeschreibung und Button "Ladepunkt anlegen" (öffnet den bisherigen Wizard).
- Statistik-Leiste oben (gesamt / verfügbar / belegt / offline / gestört) über alle Mandanten, klickbar als Statusfilter — dieselbe Komponente wie im Tenant.
- Suchfeld (Name, OCPP-ID, Mandant, Standort) und Mandantenauswahl "Alle Mandanten".
- Tabelle mit: Ladepunkt-Name, Mandant, Standort/Adresse, OCPP-ID, Status-Badge inkl. Live-Daten-Hover, Steckertypen, max. Leistung, letzter Heartbeat, WS-Verbindung.
- Aufklappbare Zeile je Ladepunkt mit den Steckern (Status, Typ, Leistung) — wie im Tenant.
- Drei-Punkte-Menü je Zeile (Projektmuster): OCPP-Log dieses Ladepunkts öffnen, QR-Code, Öffentlicher Statuslink, Zum Mandanten springen.
- Klick auf den Namen öffnet die Detailansicht des Ladepunkts (Service-Zugriff ohne Umwege).

Reine Service-Ansicht: Bearbeiten und Löschen bleiben beim Tenant, im Super-Admin nur Anlegen (Wizard) und Einsehen/Diagnose.

## Technische Umsetzung

- Neue Seite `src/pages/SuperAdminChargePoints.tsx` unter der bestehenden Route `/super-admin/ocpp/onboarding`; der Wizard wandert in einen Dialog bzw. wird per State auf derselben Route eingeblendet (Inhalt von `SuperAdminChargePointOnboarding.tsx` bleibt unverändert und wird nur eingebettet).
- Neuer Hook `src/hooks/useAllChargePoints.tsx`: `charge_points` ohne `tenant_id`-Filter, sortiert nach Name, plus zugehörige `charge_point_connectors` in einer zweiten Abfrage (analog zur bereits vorhandenen globalen Abfrage in `SuperAdminOcppControl.tsx`). Mandantennamen über `useTenants()`.
- Wiederverwendete Komponenten: `ChargingOverviewStats`, `ConnectorTypeIcons`, `StatusLiveDataHover`, `ChargePointQrCode`, `PublicStatusLinkDialog`, `OcppLogViewer` (mit `ocppId`-Prop), `RowActions`, `SortableHead`, `normalizeChargePointStatus`.
- Um Duplizierung zu vermeiden, werden Statusspalte und Stecker-Aufklappzeile als gemeinsame Präsentationskomponente `src/components/charging/ChargePointsTableRows.tsx` aus `ChargingPoints.tsx` extrahiert und in beiden Seiten genutzt.
- Detail-Sprung: Route `/charging/points/:id` läuft heute hinter dem Mandanten-/Modulguard. Damit der Super-Admin dort landen kann, wird eine Super-Admin-Route `/super-admin/ocpp/points/:id` ergänzt, die dieselbe Detailkomponente ohne Mandantenguard rendert.
- Sidebar `SuperAdminSidebar.tsx`: Label "Ladepunkt anlegen" → "Ladepunkte".
- Keine Datenbank-, RLS- oder Serveränderungen; Super-Admin liest bereits mandantenübergreifend.
