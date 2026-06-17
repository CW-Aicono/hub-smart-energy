Ich habe bereits **lesend** geprüft: Die Datenbank enthält für AICONO Zentrale ab Mitte Februar 2026 sehr wohl Werte. Wenn die Jahresgrafik Januar–Mai als 0 zeigt, ist das **kein Datenmangel**, sondern ein Anzeige-/Berechnungsproblem.

## Bereits verifizierte Fakten

Für den Mandanten mit AICONO Zentrale/Rathaus sind echte Daten vorhanden:

```text
AICONO Zentrale – Strom, Tages-Summen 2026
Feb:  8.462,96 kWh
Mär: 44.159,49 kWh
Apr: 31.260,68 kWh
Mai: 29.575,08 kWh
Jun: 16.112,66 kWh

AICONO Zentrale – 5-Minuten-Rohdaten vorhanden ab:
16.02.2026 ca. 08:00/10:30 bis 16.06.2026 23:55

Januar 2026:
0 kWh ist plausibel, weil dort noch keine Messwerte vorhanden sind.
Februar bis Mai 2026:
0 kWh ist nicht plausibel.
```

Rathaus hat ebenfalls Werte, aber die Größenordnung wirkt für ein Rathaus auffällig niedrig und muss separat geprüft werden:

```text
Rathaus – Strom, Tages-Summen 2026
Feb: 54,22 kWh
Mär: 254,14 kWh
Apr: 45,30 kWh
Mai: 94,81 kWh
Jun: 68,07 kWh
```

## Wahrscheinliche Ursache

Die Daten selbst sind nicht komplett leer. Das Problem liegt sehr wahrscheinlich darin, dass **Dashboard, Copilot Analytics und gespeicherte Analysen nicht konsequent dieselbe verlässliche Datenquelle verwenden**.

Aktuell existieren mehrere Wege:

1. 5-Minuten-Leistungswerte werden zu kWh integriert.
2. Tageswerte werden aus `meter_period_totals` gelesen.
3. Für aktuelle Zeiträume werden Live-Gateway-Werte verwendet.
4. Der EMS-Copilot liest nochmals eigene Summen.

Dadurch können Jahres-/Monatsansichten und KI-Analysen voneinander abweichen.

## Umsetzungsplan

### 1. Eine gemeinsame „Wahrheitsquelle“ für Verbrauchswerte festlegen

Ich werde eine zentrale Berechnungslogik verwenden für:

- Dashboard-Jahresgrafik
- Dashboard-Monats-/Wochenansicht
- EMS-Copilot Analytics
- gespeicherte Analytics-Ergebnisse

Regel:

```text
Für abgeschlossene Tage:
verwende gespeicherte Tageswerte aus meter_period_totals.

Wenn ein Tageswert fehlt:
berechne ihn aus 5-Minuten-Leistungswerten.

Für den aktuellen Tag:
berechne aus 5-Minuten-Werten plus vorhandenen Live-Werten nur dann, wenn nötig.
```

Damit werden Januar–Mai nicht mehr fälschlich leer angezeigt, wenn Tageswerte vorhanden sind.

### 2. Dashboard-Grafik korrigieren

Ich werde die Jahresansicht der Energieverbrauch-Grafik so korrigieren, dass sie die validierten Tageswerte sauber zu Monaten aufsummiert.

Erwartetes Ergebnis für AICONO Zentrale:

```text
Jan 2026: 0 kWh
Feb 2026: ca. 8.463 kWh Strom
Mär 2026: ca. 44.159 kWh Strom
Apr 2026: ca. 31.261 kWh Strom
Mai 2026: ca. 29.575 kWh Strom
Jun 2026: ca. 16.113 kWh Strom, soweit bisher vorhanden
```

### 3. EMS-Copilot Analytics korrigieren

Die Copilot-Analyse soll nicht mehr aus einer abweichenden Rohdatenlogik arbeiten.

Ich werde die Edge Function `copilot-analytics` so anpassen, dass sie dieselben validierten Summen nutzt wie das Dashboard.

Zusätzlich bekommt der KI-Kontext eine einfache Qualitätsinfo:

```text
Datenabdeckung pro Standort / Energieart / Zeitraum
- Anzahl erwarteter Tage
- Anzahl vorhandener Tageswerte
- Anzahl per 5-Minuten-Fallback berechneter Tage
- Hinweis, wenn Werte unvollständig oder auffällig sind
```

So kann die KI keine scheinbar sicheren Analysen erzeugen, wenn die Datengrundlage fraglich ist.

### 4. Interne Plausibilitätsprüfung für alle Liegenschaften

Ich werde eine interne Validierung ergänzen bzw. ausführen, die pro Liegenschaft und Monat vergleicht:

```text
A) Summe gespeicherter Tageswerte
B) Summe aus 5-Minuten-Leistungswerten
C) gespeicherte Monatswerte, falls vorhanden
D) Abweichung in Prozent
E) Datenabdeckung in Tagen / 5-Minuten-Samples
```

Auffälligkeiten werden markiert, z. B.:

- Tageswerte fehlen, obwohl 5-Minuten-Werte vorhanden sind.
- Tageswerte und 5-Minuten-Summen weichen stark voneinander ab.
- Ein Hauptzähler hat Energieart `none` und wird dadurch für Verbrauchsanalysen unbrauchbar.
- Ein Standort hat Hauptzähler, aber keine echten Messwerte.

### 5. Rathaus gesondert prüfen

Beim Rathaus ist nicht nur die Anzeige falsch, sondern eventuell auch die Zählerzuordnung oder Einheit.

Ich werde prüfen:

- Ist der richtige Strom-Hauptzähler als `is_main_meter = true` markiert?
- Ist `energy_type = strom` korrekt?
- Ist die Einheit korrekt?
- Sind die Werte kW, W, Wh oder kWh?
- Wird eventuell nur ein Unterzähler statt des Gebäude-Gesamtverbrauchs analysiert?

Ohne diese Prüfung wäre eine Kundenanalyse tatsächlich nicht belastbar.

### 6. Sicherheitsregel für Kundenanalyse

Wenn die Datenabdeckung oder Plausibilität schlecht ist, soll der Copilot nicht mehr selbstbewusst falsche Ergebnisse liefern.

Stattdessen soll er klar sagen:

```text
Für diesen Zeitraum liegen Messwerte vor, aber die Datenqualität ist auffällig.
Bitte prüfen Sie zuerst die Zählerzuordnung / Einheit / Datenabdeckung.
```

## Erfolgskontrolle nach Umsetzung

Nach der Korrektur prüfe ich konkret:

1. AICONO Zentrale Jahresgrafik 2026 zeigt Februar bis Juni Werte.
2. Rathaus zeigt nicht mehr 0,05 kWh, wenn validierte Tageswerte vorhanden sind.
3. „Alle Liegenschaften“ entspricht ungefähr der Summe der Einzelstandorte.
4. EMS-Copilot nennt dieselben Größenordnungen wie das Dashboard.
5. Gespeicherte Analysen bleiben abrufbar und zeigen das korrekte Ergebnis.

## Wichtig

Ich werde **keine Messdaten verändern oder löschen**. Zuerst wird nur die Berechnungs-/Anzeige-Logik korrigiert und die Plausibilität sichtbar gemacht. Datenkorrekturen an echten Messwerten würden erst danach gezielt erfolgen, wenn eindeutig feststeht, welcher Zähler oder welche Einheit falsch ist.  
  
Wichtiger Hinweis zur Liegenschaft Rathaus: Das ist nur eine Testumgebung, kein echtes Rathaus. Insofern sind die Werte korrekt, der Loxone Miniserver sendet Daten eines kleinen Hauses. Bitte also ignorieren, dass hier sehr leine Werte kommen.