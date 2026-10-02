# OCPP-Log im Super-Admin: Doppelung entfernen, Befüllung reparieren

## Befund (verifiziert)

Es gibt den Log tatsächlich zweimal:

1. **/super-admin/ocpp/integrations → Reiter "OCPP-Nachrichtenlog"**: Hier wird der Log-Viewer ohne Ladepunkt eingebunden (`<OcppLogViewer showCpColumn />`). Ohne Ladepunkt-ID fragt der Log-Hook gar keine Daten ab — diese Ansicht kann prinzipbedingt **nie** Einträge zeigen ("Keine OCPP-Nachrichten vorhanden").
2. **/super-admin/ocpp/control → Reiter "OCPP-Log"**: Hier gibt es Mandanten- und Ladepunkt-Auswahl. Die Ladepunkt-Liste stammt aber aus dem mandantengebundenen Hook (`useChargePoints`, `.eq("tenant_id", tenant.id)`). Ein Super-Admin hat keinen eigenen Mandanten, deshalb ist die Liste immer leer → "Keine Ladepunkte vorhanden", und der Log kann nie geöffnet werden.

Zusätzlich löst der Log-Viewer intern die zweite ID (OCPP-ID neben UUID) ebenfalls über den mandantengebundenen Hook auf — im Super-Admin bleibt diese Auflösung leer, wodurch Frames fehlen würden, die der OCPP-Server unter der OCPP-ID protokolliert.

## Was geändert wird

1. **Doppelung entfernen**: Auf der Integrationen-Seite entfällt der Reiter "OCPP-Nachrichtenlog". Die Seite zeigt dann nur noch die Ladestationsmodelle (Tabs entfallen bzw. bleiben nur mit dem verbleibenden Inhalt).
2. **Ladepunkte global laden**: Auf der OCPP-Control-Seite werden die Ladepunkte für die Log-Auswahl mandantenübergreifend geladen (Abfrage auf `charge_points` ohne Mandantenfilter, wie es die Firmware-Seite im Super-Admin bereits macht). Die Mandantenauswahl filtert diese Liste dann clientseitig.
3. **Beide IDs abfragen**: Der Log-Viewer bekommt die zugehörige OCPP-ID optional als Eigenschaft mitgegeben, damit im Super-Admin auch Nachrichten sichtbar sind, die unter der OCPP-ID statt der internen ID gespeichert wurden.

## Technische Details

- `src/pages/SuperAdminOcppIntegrations.tsx`: Tab "OCPP-Nachrichtenlog" samt `OcppLogViewer`-Import und Tab-Wrapper entfernen.
- `src/pages/SuperAdminOcppControl.tsx`: neue `useQuery` (`sa-ocpp-charge-points`) auf `charge_points` mit `select("id, tenant_id, name, ocpp_id")`, sortiert nach Name; Log-Auswahl und Ladepunkt-Namen der Sitzungstabelle nutzen diese Liste. Ausgewählte OCPP-ID an den Viewer weiterreichen.
- `src/components/charging/OcppLogViewer.tsx`: optionale Eigenschaft `ocppId`; wird sie gesetzt, fließt sie zusätzlich in `logIds`, unabhängig vom mandantengebundenen Hook. Bestehendes Verhalten auf Mandantenebene bleibt unverändert.
- Keine Datenbank-, RLS- oder Serveränderungen.
