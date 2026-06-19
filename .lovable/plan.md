## Befund

Du hast recht — die Datenlage ist für Strom, Gas und Wasser **identisch**:
- Alle 3 Hauptzähler (Strom „Zähler Gesamtverbrauch", Gas, Wasser) hängen am selben Loxone-Miniserver der AICONO Zentrale.
- DB-Check der letzten 3 h: jeweils 8 Werte mit **exakt denselben Zeitstempeln** (z. B. 17:00:31, 16:46:30, 16:30:53, 16:18:26 …) → 15‑Min‑Poll für alle drei.

Die Render-Logik in `src/components/dashboard/EnergyChart.tsx` (Tagesansicht) baut aber pro Energieart eine eigene 288er-5‑Min‑Spur:
- **Volle Linie** (gestrichelt, `dataKey={key}`) = forward-gefüllter Wert in jedem 5‑Min‑Slot.
- **„Real"-Linie** (durchgezogen, `dataKey=real_${key}`) = nur in Slots mit echter Messung. `connectNulls=false`.

Bei reinem 15‑Min‑Poll (echte Slots im Abstand von 3) hat die Real-Linie immer 2 `null`-Slots dazwischen, deshalb **kann sie keine durchgezogenen Segmente zeichnen** — übrig bleibt die gestrichelte Forward-Fill-Linie. Das müsste also für **alle drei** Reihen gleich aussehen. Dass Strom optisch trotzdem durchgezogen wirkt, liegt fast sicher daran, dass `real_strom`-Punkte durch den großen Wertebereich/Dot-Marker visuell „verbinden", während Wasser/Gas nahe der Nulllinie als reine Strichelung sichtbar werden.

→ Die Unterscheidung „dashed vs. solid" über die 5‑Min‑Rasterung ist mit 15‑Min‑Polling strukturell nicht mehr sinnvoll. Genau das beweisen auch die Custom‑Widgets: die rendern eine einzige Linie und sehen deshalb durchgezogen aus.

## Fix-Vorschlag (minimal-invasiv, nur Tagesansicht)

**Gap-Erkennung von „Slot-Rasterung" auf „Zeit-Abstand" umstellen** in `EnergyChart.tsx`:

1. In Schritt 2 (per‑Meter Forward-Fill, Zeile ~424–447) zusätzlich pro Meter den Poll-Abstand schätzen (Median der Abstände zwischen echten Messungen der letzten ~2 h, default 5 Min).
2. Einen Slot als **„noch real" markieren**, solange `slotsSinceReal * 5 min ≤ pollIntervalMin + Toleranz (5 Min)`.
   - 5‑Min‑Poll → real bleibt 1 Slot lang real (heute schon so)
   - 15‑Min‑Poll → real bleibt 3 Slots lang real → `real_*`-Linie wird zusammenhängend → durchgezogen
   - 60‑Min‑Poll → real bleibt 12 Slots lang real
3. Echte Datenausfälle (kein Wert > Poll‑Intervall + Toleranz) bleiben gestrichelt — `MAX_FILL_SLOTS=36` (= 3 h Outage-Limit) bleibt unverändert.
4. Keine Änderung an Wochen-/Monats-/Jahresansicht, keine Änderung an Custom-Widgets, keine Code-Löschung, kein DB-Schreibvorgang.

## Erwartetes Ergebnis

- Strom, Gas, Wasser (AICONO Zentrale) zeigen nach Reload alle drei eine **durchgezogene Linie** bei 15‑Min‑Poll.
- Wärme bleibt gestrichelt (kein Zähler vorhanden) — unverändert korrekt.
- Bei echten Lücken > Poll‑Intervall + 5 Min wird wie bisher gestrichelt überbrückt; > 3 h bleibt Lücke.

## Validierung nach dem Bauen

- Dashboard AICONO Zentrale → Tagesansicht prüfen: alle 3 Linien durchgezogen ab ~13:00 gestern.
- Andere Liegenschaft mit 5‑Min‑Poll prüfen: kein Regress, Linien weiterhin durchgezogen, Outage‑Lücken weiterhin gestrichelt.

OK so umsetzen?