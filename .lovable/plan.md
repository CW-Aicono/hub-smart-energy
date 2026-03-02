
# Zählerstand-Korrektur und Ablesehistorie

## Probleme
1. **Niedrigere Werte werden nicht gespeichert** -- Die Warnung wird zwar angezeigt, aber das Speichern funktioniert trotzdem (kein Code-Block verhindert es). Das Problem liegt vermutlich daran, dass die Validierung `numericValue >= 0` zwar erlaubt, aber eventuell ein DB-Constraint oder RLS-Policy das verhindert. Das muss geprueft und ggf. behoben werden.
2. **Keine Historie sichtbar** -- Der Ablese-Dialog zeigt nur den letzten Stand, nicht alle frueheren Ablesungen.
3. **Keine Loeschfunktion** -- Es gibt aktuell keine `deleteReading`-Funktion im Hook.

## Aenderungen

### 1. `useMeterReadings.tsx` -- Delete-Funktion hinzufuegen
- Neue Funktion `deleteReading(id: string)` die den Datensatz aus `meter_readings` loescht
- Nach Loeschung: `fetchReadings()` aufrufen und Toast anzeigen

### 2. `AddMeterReadingDialog.tsx` -- Erweitern zum kombinierten Ablese-/Historien-Dialog
- **Neue Props**: `readings` (alle Ablesungen dieses Zaehlers) und `onDeleteReading` Callback
- **Neuer Bereich** unterhalb des Eingabeformulars: scrollbare Liste aller bisherigen Ablesungen mit Datum, Wert und Loeschbutton (Muelleimer-Icon)
- Loeschung mit Bestaetigung (AlertDialog): "Moechten Sie diesen Zaehlerstand wirklich loeschen?"
- Die Liste wird chronologisch absteigend sortiert (neueste oben)

### 3. `MetersOverview.tsx` -- Readings und Delete-Callback durchreichen
- Die `readings` aus `useMeterReadings` gefiltert nach `readingDialogMeter.id` an den Dialog uebergeben
- `onDeleteReading` an `deleteReading` aus dem Hook binden

### 4. DB-Pruefung: Niedrigere Werte speichern
- Sicherstellen, dass kein DB-Constraint oder Trigger das Speichern niedrigerer Werte blockiert. Falls vorhanden, entfernen -- die Warnung im UI reicht als Hinweis.

## Technische Details

### Dialog-Layout (erweitert)
```text
+----------------------------------+
| Zaehlerstand erfassen            |
| Zaehler XY (12345)               |
+----------------------------------+
| Ablesedatum:  [  02.03.2026  ]   |
| Letzter Stand: 65.487,5 kWh      |
| Neuer Stand:  [____________]     |
| Notizen:      [____________]     |
|                                  |
|         [Abbrechen] [Speichern]  |
+----------------------------------+
| Bisherige Ablesungen             |
+----------------------------------+
| 02.03.26  65.487,5 kWh   [Trash]|
| 10.02.26     289,0 kWh   [Trash]|
| 15.01.26     185,0 kWh   [Trash]|
+----------------------------------+
```

### Betroffene Dateien
1. **src/hooks/useMeterReadings.tsx** -- `deleteReading` hinzufuegen
2. **src/components/meters/AddMeterReadingDialog.tsx** -- Historien-Liste und Loeschfunktion
3. **src/pages/MetersOverview.tsx** -- Neue Props durchreichen
