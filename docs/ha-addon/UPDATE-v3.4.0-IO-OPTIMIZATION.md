# Update v3.4.0 – Disk-IO Optimierung (Cloud-Schonung)

**Datum:** 8. Juni 2026
**Grund:** Die Lovable-Cloud-Datenbank meldete *„Disk-IO-Budget zu 75 % ausgelastet"*. Die Tiefenanalyse hat gezeigt, dass der bisherige Flush-Takt des Add-ons (alle **5 Sekunden**) die mit Abstand größte Schreiblast erzeugt hat. Mit Version 3.4.0 wird das auf **60 Sekunden** vergrößert, und die Batch-Größe wird auf **1000 Readings** angehoben.

## Was sich konkret ändert

| Einstellung               | Vorher | Nachher | Wirkung                                                   |
| ------------------------- | ------ | ------- | --------------------------------------------------------- |
| `flush_interval_seconds`  | 5      | **60**  | 12× weniger Cloud-Requests pro Gateway                    |
| `FLUSH_BATCH_SIZE` (Code) | 200    | 1000    | weniger Round-Trips bei großen Datenmengen / Backlogs     |
| Untergrenze (clamp)       | 1 s    | 15 s    | verhindert versehentliches Heruntersetzen via Remote-Sync |

**Keine Datenverluste:** Die Werte landen wie bisher zuerst im lokalen SQLite-Puffer (`readings_buffer`). Der einzige Unterschied ist, dass das Bündel-Paket alle 60 s statt alle 5 s zur Cloud rausgeht.

## Was muss der Anwender tun?

### A) Wenn das Add-on über das **CW-Aicono/ha-addons** Repository installiert ist

1. **Lovable jetzt veröffentlichen** (Publish-Button)
2. Inhalte aus diesem Ordner (`docs/ha-addon/`) manuell in das Repo **CW-Aicono/ha-addons → `ems-gateway-hub/`** kopieren und committen
3. In Home Assistant: **Einstellungen → Add-ons → AICONO EMS Gateway → Aktualisieren** klicken
4. Falls die Versionsanzeige nicht umspringt: **Add-on-Store-Repository entfernen + erneut hinzufügen + Home Assistant neu starten** (bekanntes HA-Caching-Problem)

### B) Bestehende Installationen mit individueller Config

Wer schon manuell einen `flush_interval_seconds`-Wert eingetragen hat, sollte ihn in den **Add-on-Optionen** auf `60` setzen. Werte unter `15` werden ab v3.4.0 automatisch auf `15` angehoben.

## Erwartete Wirkung

- **Gateway-Ingest-Requests:** −85 % bis −92 % pro Gateway
- **Disk-IO-Budget:** sollte binnen 24 h sichtbar fallen (Beobachtung in Lovable-Cloud → Backend → Advanced settings)
- **Latenz der Messwerte im Dashboard:** maximal +55 s (statt alle 5 s, jetzt alle 60 s) – für Energie-Monitoring ohne Relevanz

## Rollback

Falls etwas Unerwartetes passiert, lässt sich der alte Wert über die Add-on-Optionen wieder einstellen (`flush_interval_seconds: 15` als Minimum). Ein Downgrade auf 3.3.0 ist möglich, aber nicht empfohlen.
