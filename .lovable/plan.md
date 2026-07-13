# Plan: Autarkie & Eigenverbrauch – Herkunft, Bugs, Verschiebung in die Detailansicht

## 1. Woher kommen die Werte heute?

In `src/components/dashboard/EnergyFlowMonitor.tsx` (ab Zeile 435) werden die beiden KPIs **im Widget selbst** aus den Live-Leistungen der Rollen `pv`, `grid` und `house` berechnet:

```text
pvW         = max(0, live(pv))
gridW       = live(grid)                // + = Bezug, − = Einspeisung (Default-Konvention)
gridImport  = max(0,  gridW)
gridExport  = max(0, -gridW)
houseW      = max(0, pvW + gridImport − gridExport)

Autarkie       = (houseW − gridImport) / houseW · 100
Eigenverbrauch = (pvW    − gridExport) / pvW    · 100
```

Es fließen **nur PV + Netz + Gebäude** ein — Speicher-Laden/-Entladen und EV-Ladung werden ignoriert. Anzeige-Ort: Chip unten links im Flow-Widget.

## 2. Warum steht dort im Screenshot „-38 %"?

Der Screenshot zeigt PV 5,55 kW, Netz 7,64 kW, EV 1,00 kW, Speicher 7 W, Gebäude 0 kWh.
Der Netz-Zähler liefert offenbar mit **umgekehrter Vorzeichenkonvention** einen positiven Wert, der real eine **Einspeisung** ist (oder umgekehrt). Rechnung mit gridExport = 7,64:

```text
Eigenverbrauch = (5,55 − 7,64) / 5,55 = −37,7 %   → passt exakt zu −38 %
houseW         = max(0, 5,55 + 0 − 7,64) = 0     → Autarkie 0 %
```

Ursachen und offene Punkte:
- **Bug A (Vorzeichen):** Die kürzlich eingeführte Option „Flussrichtungserkennung umstellen" (pro Zähler) wird beim Berechnen von `gridW` in `getLiveWatts` bzw. hier nicht auf den Netzzähler angewandt — oder der Zähler ist falsch konfiguriert und die Formel puffert das nicht ab.
- **Bug B (Semantik):** Eigenverbrauch kann per Definition **nie negativ** und **nie > 100 %** sein. Aktuell wird nur oben mit `Math.min(100, …)` gekappt, unten fehlt `Math.max(0, …)`. Gleiches gilt für Autarkie.
- **Bug C (fehlende Loads):** `houseW` schließt Speicher-Ladung und EV-Ladung nicht ein. Bei Anlagen mit Batterie/EV entstehen strukturell falsche Prozentwerte, sobald die Batterie lädt oder das Auto zieht.
- **Bug D (Zeitfenster):** Live-Momentanwerte sind für „Autarkie/Eigenverbrauch" ungeeignet (schwanken sekündlich zwischen 0 % und 100 %). Kennzahlen dieser Art gehören auf ein Zeitfenster (Tag/Woche/Monat) und auf Energiemengen (kWh), nicht auf kW.

## 3. Vorschlag

### 3.1 Aus dem Flow-Widget entfernen
Den KPI-Footer (`kpiFooter`, Zeilen 435–450 und Render-Block 712–724) aus `EnergyFlowMonitor.tsx` **ersatzlos entfernen**. Das Widget bleibt fokussiert auf Live-Topologie und -Flüsse.

### 3.2 In die Gebäude-Detailansicht verschieben
Die beiden Kennzahlen bekommen ihren Platz in der Detailansicht des Gebäude-Knotens (Route/Panel, das per „Detailansicht"-Button vom `house`-Popover geöffnet wird — vorherige Umbenennung „Zum Zähler in der Übersicht" → „Detailansicht").

Dort neu:
- Zeitraum-Umschalter, konsistent mit dem restlichen Dashboard: **Tag / Woche / Monat / Jahr**.
- Berechnung auf **Energiemengen (kWh)** über das gewählte Fenster (bereits vorhandene RPC `get_meter_period_sums`, analog zu `useLocationYearlyConsumption`).

Formeln (korrekt, mit Speicher + EV):

```text
E_pv           = Erzeugung im Zeitraum
E_gridImport   = Netzbezug im Zeitraum       (Vorzeichen laut Meter-Config)
E_gridExport   = Einspeisung im Zeitraum
E_battCharge   = geladene Energie in Speicher
E_battDischarge= entladene Energie aus Speicher

E_load = E_pv + E_gridImport + E_battDischarge − E_gridExport − E_battCharge

Eigenverbrauch = clamp01( (E_pv − E_gridExport) / E_pv )              // 0 wenn E_pv = 0
Autarkie       = clamp01( (E_load − E_gridImport) / E_load )          // 0 wenn E_load = 0
```

`clamp01` = `max(0, min(100, x))`. Wenn kein PV-Knoten oder kein Netz-Knoten vorhanden ist, KPI ausblenden statt „0 %".

### 3.3 Sign-Konvention respektieren
Beim Aufsummieren der Netz-Energie die pro Zähler eingestellte Flussrichtung anwenden (dieselbe Logik wie im übrigen Dashboard, z. B. `lib/meterOffset.ts` / Meter-Config). So verschwindet der eigentliche Grund für die −38 %.

## 4. Betroffene Dateien

- `src/components/dashboard/EnergyFlowMonitor.tsx` — KPI-Footer entfernen (Zeilen ~435–450, ~712–724).
- Gebäude-Detailansicht (Ziel des „Detailansicht"-Buttons; Datei über die Route/Handler des house-Popovers ermitteln, sobald in Build-Modus gewechselt) — neuer KPI-Block mit Zeitraum-Selector.
- Kleiner Hook z. B. `src/hooks/useBuildingSelfSufficiency.ts` — kapselt Meter-Selektion (`pv`/`grid`/`battery`), RPC-Aufruf `get_meter_period_sums`, Sign-Handling und Formel.
- Keine Datenmodell- oder Migration-Änderungen.

## 5. Nicht-Ziele

- Kein Umbau der Meter-Konfiguration.
- Keine Änderung an der Flow-Animation oder an anderen Widgets.
- Kein neuer Live-KPI im Flow-Widget.

Bitte bestätigen, dann setze ich um.
