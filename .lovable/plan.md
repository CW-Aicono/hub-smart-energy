## Analyse: Was funktioniert bereits, was fehlt?

### 1. Zugangssteuerung — Status

**Funktioniert (Gruppe + Einzel-Ladepunkt):**
- UI für „Freies Laden", „Nutzergruppen-Beschränkung" (mit Auswahl), „Maximale Ladedauer" (`AccessControlSettings.tsx`)
- Persistenz in `charge_point_groups.access_settings`, `charge_points.access_settings` und Verknüpfungstabellen `charge_point_group_allowed_user_groups` / `charge_point_allowed_user_groups`
- Gruppe überschreibt Einzel-CP (`getEffectiveAccessSettings` in `ocpp-central`)
- Backend-Enforcement bei `Authorize`/`StartTransaction`:
  - `free_charging` → akzeptiert ohne Tag
  - `user_group_restriction` → prüft Mitgliedschaft via `isUserInAllowedGroups`
  - `max_charging_duration_min` → schreibt `RemoteStopTransaction` mit `scheduled_at` in `pending_ocpp_commands`

**Lücken:**

| # | Lücke | Was fehlt |
|---|---|---|
| A1 | **Geplanter Auto-Stop wird nie ausgeführt** | Der OCPP-Persistent-Server (`commandDispatcher.ts`) ruft `fetchPendingCommands(connectedIds)` ab; aber `pending_ocpp_commands` wird nur dann gefiltert, wenn `scheduled_at <= now()` (siehe `ocpp-persistent-api`, Zeile 235). Soweit grundsätzlich ok — **aber** der Status `"scheduled"` wird im API-Filter nicht zugelassen (es wird nach `status='pending'` gefiltert). Der mit `status:'scheduled'` eingefügte Stop-Befehl wird daher nie gepollt. → API-Filter erweitern auf `status in ('pending','scheduled')`. |
| A2 | **Default „Maximale Ladedauer" ist 480 min, hartcodiert** | UI zeigt eingegebenen Wert (z. B. 600 min), aber wenn `> 0 && < 1440` greift Auto-Stop. Bei Wunsch „kein Limit" muss der User exakt 0 oder ≥1440 eingeben — nicht klar kommuniziert. UI sollte „0 = kein Limit" anzeigen oder einen Toggle haben. |
| A3 | **`access_settings` Initialisierung in DB fehlt für neue CPs** | Wenn ein neu angelegter Ladepunkt kein `access_settings`-JSON hat, fällt das Backend zwar auf Defaults zurück, die UI rendert aber nichts. Default-Wert in DB (`DEFAULT '{...}'::jsonb`) prüfen/setzen. |
| A4 | **Keine RFID-Tag-Logging bei „Blocked"-Resultat** | Wenn Authorize wegen Gruppen-Restriktion blockiert, gibt es keinen Eintrag in einer Audit-Tabelle. Für Diagnose wertvoll. |

---

### 2. Energiemanagement — Status

**Funktioniert (nur Gruppe):**
- UI-Toggles: Leistungsbegrenzung (`PowerLimitScheduler` mit Zeitfenster + kW/min-Wert), Dynamisches Lastmanagement, PV-Überschussladen, Günstig-Laden-Modus
- PV-Überschuss: `GroupSolarChargingConfig` schreibt in `solar_charging_config` (Referenzzähler, min W, Puffer, Priorisierung)
- Persistenz `charge_point_groups.energy_settings` (inkl. `power_limit_schedule` als JSON-Feld)

**Lücken — kritisch (alle Toggles sind reine UI-Schalter ohne Backend-Wirkung):**

| # | Lücke | Was fehlt |
|---|---|---|
| E1 | **Kein Energiemanagement-Tab am einzelnen Ladepunkt** | `ChargePointDetailDialog.tsx` hat nur Details/Zugang/Sessions. DB-Spalte `charge_points.power_limit_schedule` existiert (Migration 20260219), wird aber weder in `useChargePoints` typisiert noch im Dialog editierbar gemacht. |
| E2 | **`PowerLimitScheduler` setzt keine OCPP-Profile um** | Es existiert kein Scheduler/Edge-Function, der bei Eintreten von `time_from`/`time_to` ein `SetChargingProfile` (oder `ChangeConfiguration`) an die Wallbox schickt. `commandDispatcher.ts` hat **kein** `SetChargingProfile`-Mapping (nur RemoteStart/Stop, Reset, Unlock, ChangeConfiguration, ChangeAvailability). |
| E3 | **`solar-charging-scheduler` läuft nie automatisch** | Edge-Function existiert, hat aber **kein pg_cron-Eintrag**. Außerdem: Funktion endet bei der eigentlich entscheidenden Stelle mit `// TODO: Send OCPP SetChargingProfile commands via gateway` — d. h. die berechnete `assigned_w`-Verteilung wird nirgendwohin geschickt. |
| E4 | **Dynamisches Lastmanagement (DLM) ist nicht implementiert** | Nur ein Switch. Es fehlt: (a) Erfassung Hausanschluss-Headroom (kann `solar_charging_config.reference_meter_id` mitnutzen + Sicherungsgröße als neues Feld), (b) Verteil-Algorithmus über alle aktiven Connectoren der Gruppe, (c) periodischer Job der `SetChargingProfile` schickt. |
| E5 | **Günstig-Laden-Modus** | Nur ein Switch. Es fehlt: Anbindung an dynamische Spotpreise (Modul ist im Projekt vorhanden — `mem://features/energy-data/dynamic-pricing`), Konfiguration „lade in den X günstigsten Stunden bis Abfahrtszeit", Pausieren/Fortsetzen via OCPP. |
| E6 | **Per-CP-Override fehlt** | Falls ein Ladepunkt nicht in einer Gruppe ist, gibt es keine UI für sein eigenes `power_limit_schedule`/PV-Überschuss/etc. |
| E7 | **`SetChargingProfile` im OCPP-Server** | Muss in `docs/ocpp-persistent-server/src/commandDispatcher.ts` ergänzt werden; das Charging-Profile-Objekt (chargingProfileId, stackLevel, chargingProfilePurpose=`TxDefaultProfile`/`TxProfile`, chargingProfileKind=`Absolute`/`Recurring`, chargingSchedule mit chargingRateUnit `A`/`W`, periods) muss aus `power_limit_schedule` abgeleitet werden. |
| E8 | **Reference-Meter Auto-Wahl unzuverlässig** | `GroupSolarChargingConfig` filtert nur auf `meter_function === 'bidirectional'`. PV-Anlagen ohne bidirektionalen Hauptzähler werden nicht erkannt; Hinweis gibt es zwar, aber kein automatischer Fallback (z. B. Erzeugungs- minus Verbrauchszähler). |

---

## Implementierungsplan

### Phase 1 — Quick Fixes (Zugang)
1. **A1**: `ocpp-persistent-api` Filter erweitern: `status in ('pending','scheduled')` und nur Zeilen mit `scheduled_at IS NULL OR scheduled_at <= now()` zurückgeben.
2. **A2**: `AccessControlSettings.tsx` — bei `max_charging_duration_min === 0` Label „Kein Limit" zeigen, Tooltip ergänzen.
3. **A3**: Migration: `ALTER TABLE charge_points ALTER COLUMN access_settings SET DEFAULT '{"free_charging": false, "user_group_restriction": false, "max_charging_duration_min": 0}'::jsonb;` und Backfill für NULL-Werte.
4. **A4**: Tabelle `charging_access_log` (cp_id, idTag, result, reason, ts) + Insert in `validateIdTag` bei Reject/Blocked. Anzeige in Detail-Dialog → neuer Sub-Tab oder unter „Ladevorgänge".

### Phase 2 — Per-Charge-Point Energiemanagement (UI)
5. **E1/E6**: Neuen Tab „Energiemanagement" in `ChargePointDetailDialog` einbauen. Wenn CP in Gruppe → Hinweis „wird über Gruppe gesteuert". Sonst:
   - `PowerLimitScheduler` (wie Gruppe)
   - Switches für Dyn. Lastmgmt / PV-Überschuss / Günstig-Laden
   - `useChargePoints`-Hook + Interface erweitern um `power_limit_schedule`, `energy_settings`.

### Phase 3 — OCPP-Profile-Dispatch
6. **E7**: `commandDispatcher.ts` um `SetChargingProfile`, `ClearChargingProfile`, `GetCompositeSchedule` erweitern. Gleichzeitig Mapping-Helfer `buildProfileFromSchedule(power_limit_schedule)` in shared utility (`packages/`).
7. **E2**: Neue Edge-Function `power-limit-scheduler` (alle 5 min via pg_cron):
   - Liest alle aktiven `power_limit_schedule` (Gruppen + Einzel-CPs)
   - Berechnet aktuell gültiges Limit (`allday` vs. `window`, mit Übernacht-Logik)
   - Vergleicht mit zuletzt gesetztem Profil (neue Tabelle `charge_point_active_profile`)
   - Bei Änderung: `pending_ocpp_commands`-Insert mit `command='SetChargingProfile'` (bzw. `ClearChargingProfile` wenn Limit aufgehoben)
8. pg_cron-Migration für die neue Function.

### Phase 4 — PV-Überschuss + DLM
9. **E3**: pg_cron für `solar-charging-scheduler` (alle 1 min). TODO-Block ersetzen durch tatsächliches Schreiben von `SetChargingProfile`-Commands je Connector mit `assigned_w` umgerechnet auf Ampere (W → A: für 3-phasig 400 V → A = W/(3·230)).
10. **E4**: DLM-Implementierung
    - Neues Feld `charge_point_groups.energy_settings.dlm_max_grid_w` (Hausanschluss-Limit) — UI ergänzen
    - Pro Gruppe: Verbrauch (Referenzzähler) + Summe aktive Ladeleistungen → Headroom = `dlm_max_grid_w − (Hausverbrauch − Ladeleistung)`
    - Verteilung gleichmäßig oder nach `priority_mode`
    - Reuse `solar-charging-scheduler` oder neue Function `dlm-scheduler` (1-min-Cron)
11. **E8**: Fallback: wenn kein bidirektionaler Zähler vorhanden, virtuellen Zähler (Einspeisung = PV-Erzeugung − Hausverbrauch) automatisch anlegen lassen — Helper-Button im UI.

### Phase 5 — Günstig-Laden
12. **E5**: 
    - Datenbank: Verbindung zu vorhandenem Spotpreis-Modul nutzen
    - UI: pro Gruppe/CP „günstigste N Stunden bis HH:mm" einstellbar
    - Cron-Function `cheap-charging-planner` (stündlich): plant `SetChargingProfile` mit Schedule-Periods (laden=volle Power in günstigsten Stunden, sonst 0 A) bis zur Abfahrtszeit

---

## Reihenfolge / Priorisierung

```text
P1 (1–2 Tage): Phase 1 (A1–A4) — Zugang stabil
P2 (1 Tag):    Phase 2 (E1/E6)  — UI-Parität pro CP
P3 (2–3 Tage): Phase 3 (E2/E7)  — Leistungsbegrenzung wirklich aktiv
P4 (3–4 Tage): Phase 4 (E3/E4/E8) — PV-Überschuss + DLM aktiv
P5 (2 Tage):   Phase 5 (E5)     — Günstig-Laden
```

## Offene Entscheidungen für den User
1. **DLM-Topologie**: Pro Gruppe (=ein Hausanschluss) oder pro Standort? Im Code aktuell auf Gruppe gemappt — ok so?
2. **Günstig-Laden**: braucht eine „spätestens fertig"-Eingabe pro Ladevorgang (App?) oder reicht ein globales Zeitfenster pro Gruppe?
3. **`SetChargingProfile` vs. `ChangeConfiguration`**: Manche ältere Wallboxen unterstützen kein `SetChargingProfile`. Soll Fallback auf `ChangeConfiguration(MaxChargingCurrent)` implementiert werden? (Empfehlung: ja, vendor-abhängig in `vendorRegistry`.)
