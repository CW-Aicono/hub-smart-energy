
# Plan: Erweiterte Loxone-Template-Bibliothek + AICONO-Parameter-Push

Ziel: AICONO-Regeln laufen **lokal auf dem Loxone Miniserver** weiter, auch wenn die Cloud offline ist. AICONO deployt keine Loxone-Logik zur Laufzeit (nicht supported), sondern pflegt eine **breite, versionierte Template-Bibliothek**, die einmalig (oder per Remote-Wartung) in die Loxone Config eingespielt und danach nur noch von AICONO **parametrisiert** wird.

## Kernprinzip

```text
AICONO Cloud                Loxone Config (durch euch remote gepflegt)   Miniserver (autonom)
────────────                ────────────────────────────────────────     ─────────────────────
Regel-Editor  ── writes ──▶ VI "AICO_<Template>_<Instanz>_<Param>"  ──▶  Logikbausteine +
Automations   ◀── reads ─── VO / Statistiken                        ◀──  Wallbox-Mgr / Timer /
                                                                          Analogregler / Beschattung
```

Cloud weg → letzte Parameter bleiben aktiv, Regelung läuft lokal weiter. Cloud zurück → erneuter Push + Historie-Sync.

## Template-Bibliothek (erweitert, gruppiert)

### A – E-Mobilität & Lastmanagement
| Template | Zweck | AICONO-Parameter |
|---|---|---|
| `AICO_WallboxDLM` | Dyn. Lastmgmt n Wallboxen mit Cap | `Cap_kW`, `Prio_CP1..n`, `MinPerCP_kW`, `Enable` |
| `AICO_PVSurplus_EV` | PV-Überschuss-Laden pro Wallbox | `MinSurplus_kW`, `Target_CP`, `Mode` (nur PV/Hybrid/Boost) |
| `AICO_GridProtect` | Netzanschluss-Cap (Bezug + Einspeisung) | `MaxImport_kW`, `MaxExport_kW`, `Hysterese` |
| `AICO_TariffCharging` | Ladefreigabe nach Tarif/Zeitfenster | `Slot1..8_Start/End`, `MaxKW_Slot`, `Enable` |

### B – Energiespeicher & PV
| Template | Zweck | AICONO-Parameter |
|---|---|---|
| `AICO_StorageDispatch` | Speicherfahrplan (Laden/Entladen/Reserve) | `TargetSOC_Slot1..24`, `MaxCharge_kW`, `MaxDischarge_kW` |
| `AICO_PeakShaving` | Lastspitzen kappen | `PeakLimit_kW`, `ReserveSOC_%`, `AktivFenster` |
| `AICO_PVCurtailment` | Einspeisebegrenzung (§14a EnWG) | `MaxFeedIn_kW`, `EnableSignal` |
| `AICO_SelfConsumption` | Eigenverbrauch maximieren | `Prio_Reihenfolge` (WP/EV/Speicher/Netz), `Enable` |

### C – Heizung / Wärmepumpe / Warmwasser
| Template | Zweck | AICONO-Parameter |
|---|---|---|
| `AICO_HeatpumpSGReady` | SG-Ready-Signale (EVU-Sperre/Empfehlung/Boost) | `Mode` (1..4), `PVBoost_ab_kW`, `Sperrfenster` |
| `AICO_HeatingLimit` | Max-Leistung Heizung/Heizstab | `MaxKW`, `RoomSetpoint`, `Enable` |
| `AICO_DHWSchedule` | Warmwasser-Zeitplan + Legionellenschutz | `Sollwert_°C`, `Slots`, `LegionellenTag/Zeit` |
| `AICO_NightSetback` | Nachtabsenkung (Räume gruppiert) | `Absenkung_°C`, `Start/End`, `Wochentage` |

### D – Beschattung / Klima / Komfort
| Template | Zweck | AICONO-Parameter |
|---|---|---|
| `AICO_ShadingSummer` | Sommerlicher Wärmeschutz (Sonne + Innentemp) | `SchwelleLux`, `Innentemp_ab_°C`, `EnableFassaden` |
| `AICO_WindStormProtect` | Wind-/Sturm-Schutz Beschattung | `Wind_ab_m/s`, `Reset_nach_min` |
| `AICO_VentilationCO2` | Fensterlüftung/KWL nach CO₂ | `CO2_ab_ppm`, `MaxDauer_min` |
| `AICO_PresenceLighting` | Präsenz-basierte Beleuchtung | `Nachlauf_s`, `Helligkeit_ab_lux`, `Zeitfenster` |

### E – Sicherheit & Betrieb
| Template | Zweck | AICONO-Parameter |
|---|---|---|
| `AICO_LeakageCutoff` | Wasserleck → Ventil zu + Alarm | `SensorGruppe`, `AutoReset` |
| `AICO_PowerFailWatchdog` | Netz-Ausfall-Erkennung + kritische Lasten aus | `KritischeLasten`, `Delay_s` |
| `AICO_TariffSignal` | Zentrale Tarif-Info (HT/NT/dyn.) an alle Verbraucher | `Aktuell_ct_kWh`, `Stufe` (low/mid/high) |
| `AICO_HolidayMode` | Urlaubsmodus (Absenkung, Simulation) | `From/To`, `SimAktiv`, `Notkontakt` |

### F – Generisch (Baukasten)
| Template | Zweck | AICONO-Parameter |
|---|---|---|
| `AICO_ThresholdControl` | Grenzwert-Schalter mit Hysterese | `Setpoint`, `Hysterese`, `Enable` |
| `AICO_Schedule8` | 8-Slot-Wochenplan generisch | `Slot1..8_Start/End/Value`, `Wochentage` |
| `AICO_Formula` | Freie Formel/Verknüpfung 4 Eingänge | `A,B,C,D`, `OpMask`, `Enable` |
| `AICO_StatusMirror` | AICONO-Status → Loxone-Anzeige (Display/App-Kachel) | `TextZeile1..4`, `LEDFarbe` |

**Alle Templates** folgen einer festen Naming-Konvention `AICO_<TemplateKey>_<InstanzID>_<Param>` und bekommen dedizierte UUIDs, die AICONO per Discovery aus `LoxAPP3.json` einliest.

## Erweiterte Rollout-Wege (Remote durch euch)

Neuer Menüpunkt **Super-Admin → Loxone-Templates → Rollout**:

1. **Katalog-Ansicht**: alle Templates mit Version, Changelog, betroffene Kunden.
2. **Zielauswahl**: Kunden/Locations mit Loxone-Miniserver + Remote-Config-Zugriff.
3. **Rollout-Modus**:
   - „Vorbereiten" → Template-Snippet + Import-Anleitung als PDF/ZIP für Techniker.
   - „Remote-eingespielt markieren" → Version im `loxone_template_registry` fixieren, Discovery triggert automatisch.
4. **Health-Report**: welche Location welche Template-Version fährt, wo Update ansteht.

Der eigentliche Config-Upload bleibt bei Loxone Config (nicht automatisierbar). Der Remote-Workflow von euch bleibt manuell, aber AICONO **weiß dann sofort**, dass die neuen VIs verfügbar sind und schaltet die entsprechenden Regel-Typen für den Kunden frei.

## DB-Erweiterung

- `location_automations`: `loxone_template_key TEXT`, `loxone_template_bindings JSONB`, `execution_mode TEXT` (`cloud` | `loxone_local` | `hybrid`, Default `cloud`).
- Neue Tabelle `loxone_template_registry` (Katalog: key, version, parameters JSONB, min_miniserver_fw, description, category).
- Neue Tabelle `location_loxone_templates` (welche Templates in welcher Location mit welcher Version aktiv sind, mit Discovery-Zeitstempel).
- Migration inkl. `GRANT SELECT/INSERT/UPDATE/DELETE … TO authenticated`, `GRANT ALL … TO service_role`, Tenant-RLS.

## Discovery + Push

Edge Function `loxone-template-sync` (neu, oder als Aktion in `loxone-api`):
- **Discovery**: liest `LoxAPP3.json`, matched Prefix `AICO_*`, füllt `location_loxone_templates` und Bindings automatisch.
- **Parameter-Push**: bei Save/Trigger einer Regel mit `execution_mode ≠ cloud` → `/dev/sps/io/<uuid>/<value>`.
- **Idempotenter Heartbeat**: alle 15 min Re-Push (schützt gegen Miniserver-Reboot).
- **Verifikation**: Rückread + Log in `automation_execution_log` mit `execution_source='loxone_local'`.
- **Dedizierter Loxone-User** `aicono` mit Rechten nur auf `AICO_*`-VIs.

## UI-Änderungen

- **AutomationRuleBuilder**: bei Loxone-Integrationen Auswahl **Ausführungsort** (Cloud / Lokal / Hybrid) + Template-Dropdown (nur installierte).
- **Location-Detail → Loxone-Karte**: Liste installierter Templates + Version + „Neue verfügbar"-Badge.
- **Onboarding-Wizard**: „Loxone-Templates" mit Download aller relevanten `.Loxone`-Snippets und Kurzanleitung.

## Offline-Verhalten (Kernnutzen)

| Situation | Verhalten |
|---|---|
| Cloud online | Echtzeit-Parameter-Updates (Cap, Setpoint, Schedule, Tarifstufe …). |
| Cloud offline | Miniserver regelt mit letzten Werten lokal weiter — für **alle** obigen Templates. |
| Cloud zurück | Erneuter Push + Sync der Ist-Historie via Loxone-Statistik. |

## Nicht-Ziele

- Kein automatischer Config-Upload (nicht supported, Partnerstatus-Risiko).
- Kein `lox-cli` / Reverse-Engineering im Runtime-Pfad.
- Kein Ersatz für den AICONO-Hub — für Nicht-Loxone-Kunden bleibt der Hub-Weg bestehen.

## Milestones

1. Katalog & Snippets für Gruppe A (E-Mobilität) → PoC mit dem 40-kW-Kunden.
2. DB-Migration + `loxone_template_registry` + `location_loxone_templates`.
3. Discovery-Endpoint + Auto-Binding.
4. UI: Ausführungsort + Template-Auswahl im Regel-Editor.
5. Push + 15-min-Heartbeat + Verifikations-Log.
6. Super-Admin-Rollout-Ansicht (Version, Health, Zielauswahl).
7. Gruppe B (Speicher/PV) und C (Heizung/WP) ausrollen.
8. Gruppe D–F sukzessive (Beschattung, Sicherheit, Baukasten).
9. End-to-End-QA: Cloud trennen → Miniserver regelt weiter → Cloud zurück → Historie stimmt.
