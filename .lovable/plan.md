## Stand & nächster Schritt: gezielter Diagnose-Log (kein Fix)

Wir sind weiterhin im Stopp-Modus (Hard-Stop-Regel). Was wir bisher sicher wissen:

- Der Loxone-Snapshot (`gateway_sensor_snapshots`) für „Zähler Gesamtverbrauch" enthält **richtig**:
  - `value: "83,18"` kW (Momentanleistung, `stateName: "actual"`)
  - `secondaryValue: "540.484"` kWh (Zählerstand, `secondaryStateName: "total"`)
- In `bridge_raw_samples` für diese UUID stehen **nur** korrekte Leistungswerte (71–105 kW). Es gibt dort **keinen** Wert in der Größenordnung 540.000.
- In `meter_power_readings` ebenfalls keine Werte > 1.000.
- Edge-Logs zeigen: gateway-ingest broadcastet 17–25 Events alle 5 s, aber nur ~3–10 werden in `bridge_raw_samples` geschrieben → die restlichen Events sind die Rollen `today/total/month/year`, die nur über Realtime an die UI gehen und kein DB-Schreib-Pendant haben.

Damit ist mein Verdacht: Auf der Seite **„Aktuelle Werte"** kommt im Realtime-Broadcast für den Meter ein Event an, das fälschlich als Momentanleistung (`role="pwr"`) verarbeitet wird, obwohl es eigentlich der Zählerstand (`role="total"` = 540.480 kWh) ist. Ich kann das aber aus DB/Logs allein nicht belegen — ich muss live sehen, was im Browser ankommt.

### Vorschlag (1 Datei, 1 Zeile Diagnose, kein Logik-Fix)

In `src/pages/LiveValues.tsx` im Broadcast-Handler **eine** zusätzliche console.log-Zeile einbauen, die für „auffällige" Events (Wert > 1.000) ausgibt, was Realtime tatsächlich liefert:

```ts
for (const ev of events) {
  if (Math.abs(ev.value) > 1000) {
    console.warn("[live-values][diag] suspicious event", {
      uuid: ev.uuid, role: ev.role, value: ev.value, at: ev.at,
    });
  }
  // ... bestehende Logik unverändert ...
}
```

Keine Logik wird verändert. Keine Werte werden gefiltert. Nur eine Diagnose-Ausgabe in der Browser-Konsole.

### Was du dann tust

1. Ich pushe diese eine Log-Zeile.
2. Du lädst die Seite „Aktuelle Werte" einmal hart neu (Strg+Shift+R).
3. Wartest 30 Sekunden, bis der falsche Wert auf der Kachel erscheint.
4. Öffnest die Browser-Konsole (F12 → Tab „Console") und kopierst mir alle Zeilen, die mit `[live-values][diag]` beginnen.

Damit sehen wir in **einem** Schritt, ob

- Realtime tatsächlich `role:"pwr"` mit Wert 540.480 sendet (→ Bug liegt im Worker oder im LoxAPP3-Mapping), oder
- Realtime `role:"total"` sendet, der Client das aber falsch verarbeitet (→ Bug in `LiveValues.tsx`).

Erst danach schlage ich den genauen Fix vor.

### Was wir NICHT tun

- Keine Worker-Änderung erraten.
- Keine SQL-Migration.
- Keine UI-Logik-Änderung.

Bestätige bitte kurz mit „ok", dann schalte ich in Build-Modus, füge die eine Log-Zeile ein und du machst Schritt 2–4.
