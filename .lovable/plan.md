## Ausgangslage

Die Analyse zeigt: es existieren aktuell **drei** Lastmanagement-Pfade, nicht zwei.

| # | Wo | Steuert | Zweck |
|---|---|---|---|
| 1 | Ladepunkt-Gruppe → „Energiemanagement" (`charge_point_groups.energy_settings.dlm`, Edge `dlm-scheduler` Group-Scope) | Wallboxen einer Gruppe, gleichmäßig, ~5 min | **Soft-Limit** für eine Unterverteilung/einen Stromkreis |
| 2 | Liegenschaft → „Dynamisches Lastmanagement" (`location_dlm_config`, Edge `dlm-realtime-controller`) | Wallboxen am Standort, priorisiert, ≤60 s | **Hard-Limit** am Hausanschluss |
| 2b | (Versteckt) `dlm-scheduler` Site-Scope über `locations.grid_limit_kw` | Wallboxen am Standort, gleichmäßig, ~5 min | Legacy-Duplikat zu (2) |
| 3 | Liegenschaft → „§14a" (`grid_connections`, `steuve_devices`, `grid_curtailment_events`, Edge `grid-curtailment-apply`) | externer DSO-Eingriff, alle SteuVE-Geräte | Netzdienliche Steuerung |

Die vermutete Redundanz ist:
- **Echt** zwischen (2) und (2b): identische Aufgabe, unterschiedliche Tabelle.
- **Konzeptionell nicht** zwischen (1) und (2): (1) schützt einen Unterkreis (z. B. Parkdeck-UV), (2) den Gesamtanschluss. Der aktuelle Hilfetext in der Gruppen-UI sagt das bereits sinngemäß, wird aber optisch als „doppelt" wahrgenommen, weil beide Karten nur Wallboxen betreffen.

## Empfehlung

1. **Liegenschafts-DLM bleibt am Standort, nicht unter „Automation"**  
   Ein Realtime-Feedback-Loop (Messen → Budget → Drosseln → Verifizieren) ist etwas anderes als das regelbasierte Automation-Modul („WENN Sensor > X DANN Aktor Y"). Beides zu verschmelzen würde beide Systeme verwässern. Andere EMS-Produkte (SMA Sunny Home Manager, E3/DC, openWB, gridX) halten diese Trennung ebenfalls konsequent.

2. **Liegenschafts-DLM wird vom „Wallbox-Schutz" zum echten „Hausanschluss-Schutz"**  
   Genau der Punkt, den du ansprichst. Statt nur Wallboxen zu drosseln, wird die Karte zum Ort, an dem **alle drosselbaren Verbraucher am Standort** priorisiert werden (Wallboxen via OCPP, Wärmepumpen/Batterien/große Aktoren via Gateway-Command). So verschwindet der „doppelt gemoppelt"-Eindruck, weil (1) klar Wallbox-Gruppen-Ebene und (2) klar Gesamtstandort-Ebene mit gemischten Geräten bedient.  
   Das Datenmodell aus §14a (`steuve_devices` mit `device_type: charge_point | heat_pump | battery`) wird als Vorlage übernommen.

3. **Legacy-Redundanz (2b) entfernen**  
   Der Site-Scope-Pfad in `dlm-scheduler` (`locations.grid_limit_kw`) wird abgeschaltet — er ist funktional gedoppelt zu `dlm-realtime-controller`, langsamer und ohne Priorisierung/Fallback.

4. **§14a bleibt separat** — ist ein externer Zwangs-Eingriff (StackLevel 5), gehört nicht in normale Optimierung. Deine Einschätzung ist korrekt.

5. **Umbenennung zur Klarheit in der UI:**  
   - Gruppen-DLM → „Gruppen-Lastbegrenzung (Soft-Limit)" (klarer Scope)  
   - Standort-DLM → „Hausanschluss-Lastmanagement" (klarer Scope, nicht „Dynamisches Lastmanagement" – das klingt generisch)  
   - §14a → bleibt „Netzdienliche Steuerung (§14a EnWG)"

---

## Vorgeschlagenes Vorgehen (drei Phasen, unabhängig deploybar)

### Phase A — Aufräumen & Umbenennen *(klein, sofort)*
- **Entfernen** des Site-Scope-Zweigs in `supabase/functions/dlm-scheduler/index.ts` (bleibt reines Group-Soft-Limit).
- **Umbenennen** in der UI:
  - `ChargePointGroupsManager.tsx`: „Dynamisches Lastmanagement (Soft-Limit)" → „Gruppen-Lastbegrenzung (Soft-Limit)"
  - `DynamicDlmCard.tsx`: Titel „Dynamisches Lastmanagement (DLM)" → „Hausanschluss-Lastmanagement", Beschreibung anpassen; Hinweis-Chip „schützt Gesamtanschluss".
- **Cross-Link:** In beiden Karten eine kleine Info-Zeile („Diese Einstellung schützt X. Für Y siehe Z."), damit die Trennung sichtbar ist.
- Keine DB-Migration nötig.

### Phase B — Liegenschafts-DLM auf beliebige Verbraucher erweitern *(mittel)*
- **Datenmodell:** Neue Kind-Tabelle `location_dlm_devices` mit `location_id, device_kind ('charge_point'|'heat_pump'|'battery'|'generic_actuator'), device_ref_id, min_power_kw, max_power_kw, priority` (angelehnt an `steuve_devices`, aber für den EMS-Fall).  
  `location_dlm_config.priority_order` (heute nur CP-IDs) wird durch die neue Tabelle abgelöst; Migration behält bestehende Wallbox-Prioritäten.
- **Steuerlogik:** `dlm-realtime-controller` bekommt zwei Ausführungspfade:
  1. `charge_point` → wie bisher `SetChargingProfile`/`pending_ocpp_commands`
  2. sonstige → Gateway-Command über bestehende Infrastruktur (`gateway_commands` bzw. Aktor-Domain via `automation-core`/`executor.ts`)
- **UI:** `DynamicDlmCard.tsx` bekommt eine erweiterte Geräteliste (Wallbox / Wärmepumpe / Batterie / Aktor) mit Priorisierung; Vorschlagsliste aus vorhandenen Geräten (Klassifizierung via `deviceClassification.ts` + HA `climate`-Domain + Loxone `IRoomController`).
- **Tests:** `dlmAllocation.ts` bleibt (rein rechnerisch), zusätzlich Integrationstest für gemischte Gerätelisten.

### Phase C — Automations-Brücke *(umgesetzt)*
- Neuer Automation-Trigger-Typ `power_headroom` („WENN Hausanschluss-Reserve </>/= X kW") im shared `automation-core` und im `automation-scheduler`.
- Datenquelle: letzter `dlm_control_log`-Eintrag pro Standort (`available_kw - measured_kw`, max. 10 Min. alt) via neuer optionaler Provider-Methode `getPowerHeadroomKw(locationId)`.
- UI im `AutomationRuleBuilder` erweitert um Bedingungstyp „Hausanschluss-Reserve" mit Operator + kW-Schwelle. Damit sind ergänzende Regeln möglich (z. B. „schalte Poolpumpe ab bei knapper Reserve"), ohne die Realtime-Regelschleife des DLM zu berühren.


---

## Details / Technischer Anhang

- **Betroffene Dateien Phase A:**  
  `supabase/functions/dlm-scheduler/index.ts` (Site-Scope-Block entfernen),  
  `src/components/charging/DynamicDlmCard.tsx` (Titel/Beschreibung/Cross-Link),  
  `src/components/charging/ChargePointGroupsManager.tsx` (Titel/Cross-Link).
- **Betroffene Dateien Phase B:**  
  Migration `location_dlm_devices` (mit GRANTs + RLS + `service_role`),  
  `useLocationDlmConfig.tsx` (neue Query für Geräte),  
  `DynamicDlmCard.tsx` (erweiterte Liste),  
  `supabase/functions/dlm-realtime-controller/index.ts` (zweiter Command-Pfad),  
  `packages/automation-core/executor.ts` (Wiederverwendung Aktor-Dispatch).
- **Nicht betroffen:** §14a-Pipeline (`grid_curtailment_*`, `GridComplianceCard`, `steuve_devices`) — bleibt unverändert.

## Nächster Schritt

Wenn du Phase A + B freigibst, starte ich mit **Phase A** (kleiner, sichtbarer Aufräumschritt: Redundanz raus, Umbenennung, Cross-Links) und lege danach die Migration für **Phase B** vor. Phase C nur, wenn gewünscht.