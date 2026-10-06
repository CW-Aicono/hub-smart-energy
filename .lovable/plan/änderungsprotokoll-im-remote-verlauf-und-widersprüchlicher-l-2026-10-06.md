# Änderungsprotokoll im Remote-Verlauf und widersprüchlicher Ladepunkt-Status

## 1. „Änderungsprotokoll noch nicht eingerichtet“
**Was ich geprüft habe:** Auf Staging gibt es die Protokoll-Tabelle mit allen nötigen Feldern und Leserechten für Kunden-Admins. Der Hinweis erscheint aber bei **jedem** Ladefehler, nicht nur, wenn die Tabelle fehlt. Der Text ist also irreführend.

**Wahrscheinliche Ursache (noch zu bestätigen):** Die Abfrage baut Zeitstempel wie `…+00:00` in den Filter ein. Das `+` wird bei der Übertragung zu einem Leerzeichen, die Abfrage scheitert, und es kommt der falsche Hinweis.

**Lösung:**
- Zuerst bestätige ich die Ursache selbst, du musst nichts tun: Ich melde mich in der Vorschau automatisch an, öffne „Hilfe & Support → Remote“, klappe eine Sitzung auf und lese die Antwort der Datenbank auf diese Abfrage mit. Zusätzlich schicke ich dieselbe Abfrage einmal mit und einmal ohne `+` im Zeitstempel ab. Klappt sie nur ohne `+`, ist die Ursache bestätigt.
- Zeitstempel sicher übergeben (einheitliches UTC-Format ohne `+`) bzw. zwei getrennte Abfragen statt eines verschachtelten Filters.
- Der Hinweis „nicht eingerichtet“ erscheint nur noch, wenn die Tabelle wirklich fehlt. Andere Fehler zeigen „Änderungen konnten nicht geladen werden“.
- Prüfen, dass Aktionen des Supports während einer Sitzung tatsächlich mit der Sitzung verknüpft protokolliert werden. Sonst bleibt die Liste trotz Korrektur leer.

## 2. Übersicht „Belegt“, Detailansicht „Verfügbar“
**Ursache (im Code bestätigt):** Die beiden Ansichten rechnen unterschiedlich.
- **Übersicht:** Sobald für einen Ladepunkt ein offener Ladevorgang in der Datenbank steht, zeigt sie „Belegt“. Das gilt auch dann, wenn die Wallbox selbst „frei“ meldet. Die angezeigten „0,0 kWh“ sprechen für einen hängengebliebenen Ladevorgang ohne Energie.
- **Detailansicht:** Hier zählt nur, was die Wallbox meldet. Das ist „frei“.

**Lösung:**
- Für beide Ansichten gilt eine gemeinsame Regel: Die Meldung der Wallbox ist maßgeblich. Ein offener Ladevorgang zählt nur, wenn die Wallbox zusätzlich lädt, das Laden vorbereitet oder pausiert.
- Widersprechen sich beide, zeigt die Übersicht „Frei“ mit einem kleinen Warnhinweis „Offener Ladevorgang ohne Aktivität“.
- In der Detailansicht bekommen Admins für diesen Fall den Knopf „Hängenden Ladevorgang abschließen“. Er schließt den Ladevorgang mit dem letzten bekannten Zählerstand, damit die Abrechnung stimmt.
- Automatik: Meldet eine Wallbox „frei“ und hat ein offener Ladevorgang länger als 2 Stunden keine Energie, wird er automatisch abgeschlossen. Das läuft über die bestehende stündliche Plausibilitätsprüfung und wird protokolliert.
- Laufende echte Ladevorgänge sind nicht betroffen. Abgeschlossen wird nur, wenn die Wallbox selbst „frei“ meldet.

## Technische Details
- `RemoteSupportHistory.tsx`: Zeitwerte per `new Date(x).toISOString()` übergeben; zwei Abfragen (`support_session_id` und `actor_user_id` im Zeitfenster), Ergebnisse zusammenführen. Fehler `42P01` → Hinweis „nicht eingerichtet“, sonst allgemeiner Fehler. Prüfen, ob `audit_logs.support_session_id` beim Schreiben während einer Impersonation gesetzt wird.
- Gemeinsame Funktion `resolveConnectorStatus(connectorStatus, activeSession, online)` in `formatCharging.ts`, genutzt von ChargingPoints, ChargePointDetail, SuperAdminChargePoints und ConnectorStatusGrid.
- Plausibilitätsprüfung (bestehende stündliche Funktion) um das Abschließen hängender Sessions erweitern (`status='completed'`, `stop_reason='stale_auto_close'`, Energie aus dem letzten Zählerwert); Audit-Eintrag.
- Live-Diagnose vorab: SQL für Prozessionsweg_WB02/WB03, das offene Sessions samt Connector-Status zeigt.
- Auswirkungen: Statusanzeige, Ladestatistik (Belegt-Zähler) und öffentlicher Status-Link nutzen die neue Regel. Abrechnung bleibt korrekt, weil abgeschlossene Sessions den echten Zählerstand bekommen.
- Changelog, Release Notes, Handbuch (4 Sprachen), Version v1.3.2.
