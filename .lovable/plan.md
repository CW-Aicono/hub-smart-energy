# Live-Werte: veraltete 15-Minuten-Snapshots werden als „Live" angezeigt

## Was gemessen wurde (verifiziert)

Zähler „Erzeugung" (AICONO Zentrale, Miniserver-Integration `e6b4754f…`):

- Rohtabelle `meter_power_readings`: letzter Eintrag **06:27 Uhr** (-51,9 kW) — seit dem Schreiblast-Fix praktisch tot.
- `meter_power_readings_5min`: Einträge nur alle **15 Minuten**, `sample_count = 1`, `source = loxone_pull`
  (13:25 → -37,7 | 13:10 → -77,7 | 12:55 → -99,6 | 12:40 → -74,9 …).
- Das UI zeigte -77,71 kW = der Bucket von **13:10**, also ein bis zu 15 Minuten alter Einzel-Schnappschuss — kein Live-Wert.

Also: Die Werte kommen bei diesem Zähler **nicht** über WebSocket, sondern über den HTTP-Poll (alle 15 Min, ein Messpunkt).

## Ursache

Der WS-Worker (online, Version phase7.8) beliefert nur einen Teil der Zähler:

- Letzte 3 Stunden: **24 Zähler** mit `source = bridge_ws` (Ø 14,3 Samples pro Bucket = echte 5-Min-Mittelwerte)
- **65 Zähler** nur mit `source = loxone_pull` (1 Sample alle 15 Min)

Betroffen sind auch Zähler desselben Miniservers: „Einspeisung" läuft über WS, „Erzeugung", „Netzbezug", „Eigenverbrauch", alle Gas-/Wasserzähler u. a. nur über den Pull-Fallback. Der Worker mappt beim Verbinden die Block-UUID über die LoxAPP3-Expansion auf State-UUIDs; wo diese Expansion keinen Power-State findet, kommen dauerhaft keine WS-Events an — der HTTP-Poll springt ein und niemand merkt es, weil das UI beide Quellen gleich behandelt.

Zusätzlicher Folgefehler: Die Pull-Zeilen werden mit `resolution_minutes = 5` geschrieben, obwohl sie einen 15-Minuten-Takt abbilden. Jede Energie-Integration (`Leistung × Auflösung/60`) unterschätzt diese Zähler dadurch um Faktor 3 und Tagesgraphen zeigen Lücken statt einer durchgehenden Kurve.

## Umsetzung

### 1. Ehrliche Live-Anzeige (Sofortmaßnahme, UI)
- In `src/pages/LiveValues.tsx` das Alter des gewählten Werts mitführen und anzeigen („vor 12 Min."), Badge nur bei Alter ≤ 5 Min als „Live" (grün), sonst „Verzögert" (grau) bzw. „Veraltet" (> 30 Min, gelb).
- Gleiche Frische-Regel in `EnergyGaugeWidget`, `EnergyFlowMonitor`-Knoten und PV-Widget „Jetzt".
- Quelle im Detail-Tooltip nennen: WebSocket (Echtzeit) vs. Abruf alle 15 Min.

### 2. Auflösung korrekt kennzeichnen (Datenqualität)
- Pull-Fallback in `supabase/functions/loxone-api/index.ts` schreibt künftig `resolution_minutes = <poll_interval_minutes>` (typ. 15) statt fix 5, damit die Energie-Integration stimmt.
- Bestehende `loxone_pull`-Zeilen seit der Umstellung per Migration auf die tatsächliche Auflösung korrigieren.
- Lesepfad `get_power_series_auto` prüfen, dass gemischte Auflösungen je Bucket sauber gewichtet werden.

### 3. WS-Abdeckung sichtbar machen (Diagnose)
- Super-Admin → Gateway-Flotte: Tabelle „WS-Abdeckung je Zähler" mit letzter `bridge_ws`- und letzter `loxone_pull`-Zeile, Ø `sample_count` und Status (WS aktiv / nur Pull / stumm).
- Damit lässt sich pro Miniserver benennen, welche Block-UUIDs der Worker nie expandiert.

### 4. Lücke im Worker schließen (Kern-Fix)
- Im `loxone-ws-worker` beim Verbindungsaufbau protokollieren, welche Block-UUIDs bei der LoxAPP3-Expansion keinen Power-State erhalten haben, und diese UUIDs zusätzlich direkt abonnieren (Fallback auf die Block-UUID statt sie zu verwerfen).
- Ergebnis: Diese Zähler liefern wieder echte 5-Minuten-Mittelwerte mit mehreren Samples statt 15-Minuten-Schnappschüsse.
- Update wird als Anleitung für den Hetzner-Worker dokumentiert (Worker läuft außerhalb dieses Projekts).

## Reihenfolge

1 und 3 sind sofort im Projekt umsetzbar und machen das Problem sichtbar; 2 korrigiert die Datenqualität; 4 erfordert ein Worker-Update auf Hetzner und beseitigt die Ursache.
