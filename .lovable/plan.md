## Ursache (verifiziert)

Beide Widgets lesen dieselben 5-Min-Aggregate (`get_power_readings_5min` bzw. `meter_power_readings_5min`). Der Unterschied liegt allein in der Interpolation:

- **`EnergyChart.tsx` („Energieverbrauch (kW)")** — Zeilen 386–440: baut ein festes 288-Slot-Raster (5 min) und **forward-fillt** jeden leeren Slot mit dem letzten realen Wert (bis zu 36 Slots / 3 h). Bei 15-Min-Poll liegen zwischen zwei echten Messungen zwei Kopien → klassische **Rechteck-/Plateau-Optik**.
- **`CustomWidget.tsx` („Wasser und Gas · m³/h")** — Zeilen 268–283: leere Slots bleiben `null`, gerendert mit `type="monotone"` und `connectNulls={true}` → Recharts zieht eine glatte Spline zwischen echten Punkten.

Zusätzlich rendert `EnergyChart` mit `connectNulls={false}`, was das Bild bei ausgefallenen Reihen zusätzlich abhackt.

Kein Daten- oder Einheiten-Problem — reine Render-Logik. Ein 5-Min-Poll würde die Optik ebenfalls glätten, aber ~3× mehr IO erzeugen — daher lösen wir es im Code.

## Umsetzung — Option A (energieartabhängige Interpolation)

Nur `src/components/dashboard/EnergyChart.tsx` wird angefasst. Kein DB-, Worker- oder RPC-Eingriff.

### Änderung 1 — Forward-Fill überspringen für Wasser/Gas
In der per-Meter-Forward-Fill-Schleife ab Zeile ~430:
- Vor dem Forward-Fill die `energy_type` des Meters prüfen.
- Für `wasser` und `gas`: kein Fill — Slots bleiben `null`, echte Messpunkte bleiben erhalten.
- Für `strom` und `waerme`: Verhalten unverändert (Forward-Fill mit Poll-Intervall + Toleranz), damit die stabile Summenlinie bei 15-Min-Pollern bleibt.

### Änderung 2 — `connectNulls` energieartabhängig setzen
Line-Rendering Zeile 789:
- `connectNulls={key === "wasser" || key === "gas"}` statt fix `false`.
- Damit zeichnet Recharts für Wasser/Gas eine durchgehende Monotone-Spline zwischen den echten Punkten (wie im Custom-Widget); Strom/Wärme behalten das bisherige Verhalten (echte Ausfälle sichtbar als Lücke).

### Änderung 3 — Gap-Overlay für Wasser/Gas deaktivieren
Das gepunktete „Gap"-Overlay (Zeilen ~795 ff.) ist für Strom gedacht, um echte Datenausfälle sichtbar zu machen. Für Wasser/Gas wird es überflüssig, weil die Slots leer bleiben und die Spline die Lücke bereits visuell schließt — für diese Keys nicht mehr rendern, damit keine doppelten oder verwirrenden Linien erscheinen.

## Verifikation

- Frontend-Vergleich: Im Dashboard „Energieverbrauch"-Widget Gas bzw. Wasser aktivieren und mit dem Custom-Widget „Wasser und Gas · m³/h" nebeneinander vergleichen → Kurvenverlauf muss deckungsgleich sein (bis auf Skalierungsunterschied der Y-Achse).
- Strom-Ansicht (Standardfall) darf sich **nicht** verändern — visuelle Regression prüfen: gleiche Treppen-/Halte-Optik wie zuvor bei 15-Min-Poll-Zählern.
- Keine DB-, Edge-Function- oder Worker-Änderung. Kein IO-Impact.

## Nicht-Ziele

- Poll-Intervall bleibt bei 15 min (Empfehlung im UI unverändert).
- Datenkorrektur der bereits als „pwr" falsch klassifizierten Wasser-Readings ist ein separates Thema (siehe frühere Worker-v1.8-Diskussion) und wird hier **nicht** angefasst.
