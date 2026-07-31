# Durchfluss als Leistungswert für Gas- und Wasserzähler

Du hast recht — meine vorherige Aussage war zu pauschal. Ein Loxone-Zählerbaustein an einem Reedkontakt rechnet aus Impulsrate × Impulswertigkeit sehr wohl einen Momentanwert: den **Durchfluss** (m³/h bzw. l/min). Der State `actual` ist genau dieser Wert, `total` ist der aufsummierte Zählerstand.

## Was heute im Code steht (verifiziert)

In `docs/loxone-ws-worker/index.ts` gibt es `isFlowLikeType()` (Zeile 706): für `gas`, `wasser`, `water` wird ein mehrdeutiger State-Key (`actual`, `value`, `p`) **grundsätzlich verworfen** und der Block läuft „Total-only" (Zeilen 798–803). Fehlt sonst jeder verwertbare State, wird der Block für Fluss-Medien komplett ignoriert (Zeile 815). Das stammt aus der v1.9-Lehre (Zählerstand landete als 660-kW-Spike in der Leistungsreihe) — es wirft aber den echten Durchfluss mit weg.

Die Detailansicht kann Durchfluss bereits darstellen (dein Screenshot: „Ø Durchfluss 0,06 m³/h", „Volumen 0,90 m³"), die Datenlieferung ist also der Engpass, nicht die Anzeige.

## Umsetzung

### 1. Eigene Rolle „flow" statt Pauschal-Verbot (Worker v1.16)
- Für `gas`/`wasser` wird `actual` nicht mehr blind verworfen, sondern als **Durchfluss-Kandidat** behandelt — allerdings nur, wenn die Loxone-Struktur die Einheit bestätigt (`m³/h`, `l/min`, `l/h`, `m3/h` im `format`/`unit`-Feld des Controls). Einheit fehlt oder passt nicht → weiterhin kein Wert, Block erscheint als Lücke in der Zuordnungs-UI.
- Neue Rolle `flow` neben `pwr`: gleiche 5-Min-Bucket-Aggregation, aber getrennte Plausibilitätsgrenzen (z. B. Wasser 20 m³/h, Gas 100 m³/h statt der kW-Deckel).
- Der bestehende Schutz bleibt vollständig: ein monoton steigender Zählerstand kann nie zu `flow` werden, weil die Rolle aus Name **und** Einheit kommt und nicht aus dem Werteverlauf.

### 2. Manuelle Zuordnung auch für Gas/Wasser freischalten
- Die explizite Zuordnung (`meters.power_state_uuid`) gilt künftig auch für Fluss-Medien — sie ist die höchste Priorität und schlägt jede Heuristik.
- Im Panel „Loxone State-Zuordnung" heißt die Spalte bei Gas/Wasser **„Durchfluss-State"** statt „Leistungs-State", mit Einheit-Hinweis (m³/h). Kein Verstecken des Dropdowns mehr — meine vorherige Idee dazu entfällt.

### 3. Impulswertigkeit sichtbar machen
Die Impuls-zu-Menge-Umrechnung passiert im Miniserver; die Cloud bekommt bereits die fertige Größe. Deshalb keine eigene Impulskonfiguration im EMS — stattdessen zeigt die Zuordnungs-UI die aus Loxone gelesene Einheit je State, damit sofort erkennbar ist, ob der Baustein korrekt parametriert ist (`actual` ohne Einheit = Loxone-Konfiguration prüfen).

### 4. Anzeige und Aggregation
- Gas/Wasser-Kacheln und Detaildialog nutzen die `flow`-Reihe für Ø/Max/Min mit korrekter Einheit; die Mengen-KPI bleibt wie bisher aus `meter_period_totals`.
- Keine Umrechnung von Durchfluss in kW — Gas wird weiterhin nur für die Energiebilanz über den Brennwert umgerechnet, nicht in der Leistungsreihe.

## Verifikation
- „Wasserzähler Hausanschluss": `actual` bekommt Rolle `flow`, Live-Wert in m³/h erscheint, `total` bleibt Zählerstand.
- Gegenprobe: ein Gaszähler ohne Einheiten-Angabe liefert weiterhin **keinen** Leistungswert und taucht als offene Zuordnung auf — statt still zu raten.
- Keine neue Zeile in `meter_power_readings_5min` mit Zählerstandsgrößen (Stichprobe über 24 h nach dem Deploy).

## Technische Details
Geändert: `docs/loxone-ws-worker/index.ts` (Rolle `flow`, Einheiten-Auswertung aus LoxAPP3-Control, `isFlowLikeType` als Rollen-Weiche statt Sperre) + `docs/loxone-ws-worker/UPDATE-v1.16-flow-role.md`; `supabase/functions/gateway-ingest` und `bridge-aggregator` für das Routing der Rolle `flow`; `src/components/super-admin/LoxoneStateMappingPanel.tsx` (Beschriftung, Einheiten, Dropdown auch für Gas/Wasser). Der Worker auf Hetzner muss nach dem Merge neu gebaut und neu gestartet werden.
