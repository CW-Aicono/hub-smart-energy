# Plan: Konfigurierbares Loxone-Polling-Intervall pro Liegenschaft

## Antworten auf deine Fragen

**1. Technisch sicher umsetzbar?**
Ja — sauber, ohne Risiko. Die Logik bleibt minimal-invasiv:

- Wir nutzen die bereits existierende Spalte `location_integrations.config` (jsonb) und speichern dort einen neuen Schlüssel `poll_interval_minutes` (1–15, Default 5).
- Die Cron-Funktion `loxone-periodic-sync` läuft **weiterhin jede Minute** (am Cron selbst ändern wir nichts), entscheidet aber pro Integration: „Ist seit `last_sync_at` mindestens `poll_interval_minutes` vergangen? Wenn nein → überspringen."
- `last_sync_at` wird sowieso schon nach jedem erfolgreichen Sync gesetzt. Keine neue Tabelle, kein neuer Cron, kein Risiko für die Schreibpfade.
- UI: Neues Feld im Loxone-Integration-Dialog der Liegenschaft (Slider oder Number-Input 1–15 Min, Default 5).

**2. Was spart das an Traffic?**
Heute pollen wir jede Liegenschaft **jede Minute**. Mit dem neuen Default-Wert 5 Min:


| Intervall           | Sync-Calls / Stunde / Liegenschaft | Ersparnis ggü. 1 Min |
| ------------------- | ---------------------------------- | -------------------- |
| 1 Min (alt)         | 60                                 | 0 %                  |
| 5 Min (neu Default) | 12                                 | **−80 %**            |
| 10 Min              | 6                                  | −90 %                |
| 15 Min (Max)        | 4                                  | **−93 %**            |


Das wirkt **zusätzlich** zu den bereits umgesetzten Optimierungen (Structure-Cache 1 h, Filter auf verknüpfte Sensoren). Realistisch landen die meisten Liegenschaften beim Default 5 Min → nochmals ~80 % weniger Loxone-Requests + ~80 % weniger `loxone-api`-Edge-Function-Calls als heute.

Hinweis: Live-Werte im Dashboard werden dadurch maximal so „frisch" wie das eingestellte Intervall. Für reine Energiezähler (5-Min-Aggregat) ist 5 Min ohnehin die natürliche Auflösung — kein Datenverlust. Wer schnellere Reaktion braucht (z. B. Aktor-Status-Visualisierung), stellt für diese eine Liegenschaft auf 1 Min.

---

## Umsetzung

### Backend

1. **Keine Migration nötig** — `config` jsonb existiert. Wir lesen/schreiben `config.poll_interval_minutes`.
2. `**loxone-periodic-sync/index.ts**`: Nach dem Laden der Integrationen pro Eintrag prüfen:
  ```text
   intervalMin = config.poll_interval_minutes ?? 5
   if last_sync_at && (now - last_sync_at) < (intervalMin*60s - 15s Toleranz)
     → skip (kein Sync, kein API-Call)
  ```
   Toleranz von ~15 s, damit ein Cron-Tick nicht knapp daneben liegt und einen Slot überspringt.
3. **Manuelle Discovery (Tacho-Button)** bleibt sofort wirksam (umgeht die Drosselung, ist ja kein Cron-Pfad).

### Frontend

4. **Loxone-Integration-Dialog** (in der Liegenschaft, dort wo Host/User/Passwort eingegeben werden): Neues Feld
  - Label: „Abfrage-Intervall (Minuten)"
  - Typ: Number-Input oder Slider, min 1, max 15, Step 1, Default 5
  - Hilfetext (de-DE): „Wie oft AICONO neue Sensorwerte vom Miniserver abruft. Niedriger = aktuellere Werte, höher = weniger Netzwerk-Last. Empfehlung: 5 Minuten."
  - Speichert in `location_integrations.config.poll_interval_minutes`.

### Sichtbarkeit / Monitoring

5. **Super-Admin-Übersicht** (bestehende Loxone-Status-Karte, falls vorhanden): pro Liegenschaft das eingestellte Intervall anzeigen, damit du auf einen Blick siehst, wo gedrosselt ist.

### Risiko & Rollback

- **Risiko: sehr niedrig.** Reine Skip-Logik vor dem API-Call. Wenn `poll_interval_minutes` fehlt, gilt Default 5. Wenn Default 5 zu langsam ist für eine Liegenschaft → im UI auf 1 stellen, sofort wirksam beim nächsten Cron-Tick.
- **Rollback:** Skip-Logik per Feature-Flag (`system_settings.loxone_respect_poll_interval` default `true`) deaktivierbar — ein UPDATE und alle Liegenschaften pollen wieder jede Minute wie früher.

### Aufwand

1 Edge-Function-Anpassung + 1 Dialog-Feld + (optional) 1 Anzeige im Super-Admin. Ein Loop.

---

## Offen (entscheidest du)

- **Default-Wert:** 5 Min bestätigt? (Alternative: 3 Min für etwas frischere Dashboards bei trotzdem −67 % Traffic.)
- **Feature-Flag** für globalen Rollback einbauen — ja/nein? Empfehlung: **ja**, kostet quasi nichts.
- **Anzeige im Super-Admin** der aktuell konfigurierten Intervalle — jetzt mitbauen oder später? Empfehlung: **jetzt mitbauen**, ist eine kleine Tabelle.  
  
Antworten:  
- Default-Wert: 5 Minuten  
- Feature-Flag: ja, mit einbauen  
- Anzeige im Super-Admin: jetzt mitbauen