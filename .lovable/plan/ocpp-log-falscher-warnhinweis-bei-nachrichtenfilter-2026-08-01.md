# OCPP-Log: Falscher Warnhinweis bei Nachrichtenfilter

## Was passiert

Im Reiter "OCPP-Log" erscheint die gelbe Warnung "Seit 553 Minuten keine neue OCPP-Nachricht", obwohl laufend Nachrichten ankommen (mit Filter "MeterValues" sind aktuelle Einträge von 12:39 Uhr sichtbar).

## Ursache (verifiziert)

Der Nachrichtentyp-Filter wird bereits in der Datenbankabfrage angewendet (`useOcppLogs` setzt `.eq("message_type", ...)`). Die Altersprüfung in `OcppLogViewer.tsx` rechnet danach mit genau dieser gefilterten Liste. Steht der Filter auf einem seltenen Typ wie `BootNotification`, ist der neueste Eintrag dieses Typs Stunden alt — die Warnung schlägt an, obwohl der Ladepunkt normal sendet. Frame-Logging und Notfallmodus sind also zu Recht unauffällig.

Zweiter, kleinerer Effekt derselben Ursache: Die Auswahlliste der Nachrichtentypen wird aus den geladenen Logs ergänzt. Ist ein Filter aktiv, schrumpft diese Liste auf den gefilterten Typ zusammen.

## Was geändert wird

1. **Altersprüfung unabhängig vom Filter**: Der Hook liefert zusätzlich den Zeitstempel der neuesten Nachricht über *alle* Typen hinweg (eine schlanke Abfrage: neuester Eintrag je Ladepunkt-ID, ohne Typfilter, Limit 1). Die 15-Minuten-Warnung basiert künftig ausschließlich auf diesem Wert.
2. **Klarer Hinweis statt Fehlalarm**: Ist ein Typfilter aktiv und für diesen Typ nur alte Einträge vorhanden, während insgesamt frische Nachrichten ankommen, erscheint keine Warnung, sondern ein neutraler Hinweis in der Ergebniszeile ("Letzter Eintrag dieses Typs: …"). Die echte Warnung (nichts kommt mehr an) bleibt unverändert erhalten.
3. **Typ-Auswahlliste stabil halten**: Die einmal erkannten Nachrichtentypen bleiben im Dropdown bestehen, auch wenn ein Filter aktiv ist.

## Technische Details

- `src/hooks/useOcppLogs.tsx`: zusätzliche Abfrage `latestAt` (max. `created_at` über alle Typen, pro ID, Limit 1); wird bei Realtime-INSERT und `refetch` mitaktualisiert und aus dem Hook zurückgegeben.
- `src/components/charging/OcppLogViewer.tsx`: `staleMinutes` aus `latestAt` statt aus `logs`; Warnbanner-Bedingung entsprechend; Hinweistext bei aktivem Filter; erkannte Nachrichtentypen in einem Ref/State kumulieren.
- Keine Datenbank-, RLS- oder Server-Änderungen; die Serverdokumentation zum Frame-Logging bleibt gültig.
