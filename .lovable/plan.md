# Anleitung + Entscheidungshilfe für die Loxone State-Zuordnung

Die Liste zeigt aktuell nur nackte State-Namen (`active`, `actual`, `total`, `jLocked`) ohne Hinweis darauf, welcher davon die Momentanleistung ist — und sie listet auch Blöcke auf, die gar keinen Leistungs-State brauchen (z. B. „Loxone Ausgang Q1", ein Schaltausgang ohne Zähler). Daher zwei Bausteine: eine feste Anleitung direkt auf der Seite und zusätzliche Entscheidungsdaten pro State.

## 1. Anleitung direkt auf der Seite

Aufklappbarer Hilfebereich („Wie ordne ich zu?") über der Tabelle mit:

- **Was ist gesucht:** genau ein State pro Zähler, der die *Momentanleistung* liefert (kW/W, springt hoch und runter, kann bei Einspeisung negativ sein).
- **Was gehört nicht dazu:** Zählerstände (steigen nur, kWh/m³ — Rolle `total`, `totalDay`, `totalMonth`, `totalYear`), Statuswerte (`jLocked`, `active`, `lockedOn`, Texte/Icons).
- **Rollen-Legende** als Tabelle: `pwr` = Leistung (aktiv genutzt), `total/today/month/year` = Energie-Summen, `soc` = Ladezustand, `aux` = unbekannt/unbenutzt, `ignoriert` = nie ein Messwert.
- **Welche Loxone-Namen automatisch erkannt werden:** `Pwr`, `Power`, `CurrentPower`, `ActualPower`, `CP` → Leistung; `Actual`, `Value`, `P` → nur bei Strom/Wärme, bei Wasser/Gas bewusst ignoriert; `EnergyTotal`, `Total`, `Zaehlerstand`, `MR` → Zählerstand.
- **Wo man im Loxone Config nachsieht:** Baustein im Peripheriebaum auswählen → Ausgänge/Statusanzeige; der Ausgang mit Einheit `kW` (bzw. `W`) ist der Leistungs-State; der Ausgang mit `kWh`/`m³` ist der Zählerstand.
- **Entscheidungsregeln in 3 Sätzen:** Gibt es einen State mit kW-Einheit → den wählen. Gibt es nur einen steigenden kWh-Wert → nichts zuordnen (Zähler bleibt Total-only, Leistung wird nicht berechnet). Ist der Block gar kein Zähler (Schaltausgang, Meldeleuchte) → nichts zuordnen.

## 2. Entscheidungsdaten in der Tabelle

Ohne Werte ist die Auswahl Raten. Deshalb:

- Der Worker sendet im Diagnose-Event `ws_block_states` je State zusätzlich den **letzten gesehenen Wert** und die **Loxone-Einheit** aus LoxAPP3 (`details.format`, z. B. `%.1f kW`).
- Die Tabelle zeigt diese Angaben im Badge (`actual: aux · 12,4 kW`) und im Auswahl-Dropdown, plus einen Trend-Hinweis „steigt nur" (= Zählerstand) vs. „schwankt" (= Leistung).
- Zeilen ohne verknüpften Zähler bzw. Blöcke ohne jeden Messwert-State bekommen statt „State wählen …" den neutralen Hinweis **„keine Zuordnung nötig"** und zählen nicht mehr als offene Lücke.
- Zusatzfilter „Nur echte Zähler" (Blöcke mit `meter_id`), damit Schaltausgänge die Liste nicht mehr füllen.

## 3. Schriftliche Anleitung

Neue Datei `docs/loxone-state-zuordnung.md` mit dem gleichen Inhalt ausführlicher (inkl. Beispieltabelle typischer Loxone-Bausteine: Utility Meter, Energiemonitor, Wallbox, Wasserzähler) — verlinkt aus dem Hilfebereich als Download/Ansicht.

## Technische Details

- `src/components/super-admin/LoxoneStateMappingPanel.tsx`: Collapsible-Hilfe, Rollen-Legende, Wert-/Einheiten-Anzeige, Filter „Nur echte Zähler", Sonderbehandlung für Blöcke ohne Messwert-States.
- `docs/loxone-ws-worker/index.ts` (Worker v1.16): `blockDiag`-States um `value` (letzter bekannter Wert), `unit` (aus LoxAPP3 `details.format`) und `trend` (`rising` | `varying` | `unknown`) erweitern; Version hochziehen. Erfordert wie üblich ein Worker-Update auf dem Host.
- Keine DB-Migration nötig — `meters.power_state_uuid/_key` existieren bereits.
