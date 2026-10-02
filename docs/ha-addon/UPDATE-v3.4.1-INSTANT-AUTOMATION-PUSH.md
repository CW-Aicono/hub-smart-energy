# Update v3.4.1 – Sofort-Meldung ausgeführter Automationen

**Datum:** 29. Juli 2026
**Grund:** Bei „Hybrid"-Automationen konnte es in seltenen Fällen zu einer doppelten Ausführung (einmal lokal auf dem Gateway, einmal aus der Cloud) kommen, wenn die Cloud kurz vor dem 60-Sekunden-Meldezyklus des Gateways ihre eigene Prüfrunde startete. Mit 3.4.1 meldet das Gateway jede lokal ausgeführte Automation **sofort** an die Cloud – nicht mehr im 60-Sekunden-Takt.

## Was ändert sich konkret

| Bereich                    | Vorher                                    | Nachher                                                  |
| -------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| Automations-Log-Push       | zusammen mit Messwerten alle **60 s**     | **sofort** nach Ausführung (max. 2 s Sammel-Fenster)     |
| Messwert-Flush (unverändert) | alle 60 s                                | alle 60 s                                                |
| Doppelausführung „Hybrid"  | theoretisch möglich im 60-s-Fenster       | zuverlässig ausgeschlossen                               |

Nur der Log-Push wird vorgezogen. Die Messwert-Übertragung bleibt beim ressourcenschonenden 60-Sekunden-Takt (IO-Budget bleibt geschont).

## Warum reicht das?

Die Cloud hält beim Modus „Hybrid" eine 90-Sekunden-Lease auf der Regel: Solange das Gateway innerhalb dieser 90 s meldet, dass es die Automation ausgeführt hat, überspringt die Cloud die Regel. Mit dem Sofort-Push landet die Meldung binnen 2 s in der Cloud – **weit vor** dem nächsten Cloud-Prüflauf (30 s). Damit ist ein Doppelfeuer praktisch unmöglich.

## Offline-Verhalten

- Wenn die Cloud nicht erreichbar ist, wird der Log-Eintrag weiterhin lokal im SQLite-Puffer aufbewahrt und beim nächsten regulären 60-Sekunden-Flush automatisch nachgereicht.
- Es geht **keine Ausführung verloren**.

## Was muss der Anwender tun?

### A) Installation über CW-Aicono/ha-addons

1. In Lovable **Publish** klicken.
2. Inhalte aus `docs/ha-addon/` in das Repo `CW-Aicono/ha-addons → ems-gateway-hub/` kopieren und committen.
3. In Home Assistant: **Einstellungen → Add-ons → AICONO EMS Gateway → Aktualisieren**.
4. Wenn die Version nicht umspringt: Add-on-Store-Repository entfernen + erneut hinzufügen + Home Assistant neu starten.

### B) Bestehende Installationen

Keine Änderungen an Einstellungen nötig. Nach dem Update greift die Sofort-Meldung automatisch.

## Erwartete Wirkung

- **Doppelausführungen bei Hybrid-Automationen:** ausgeschlossen (praktisch 0).
- **Zusätzliche Cloud-Requests:** vernachlässigbar (typisch 20–30 Automations-Auslösungen pro Tag und Gateway → +20–30 kleine HTTP-Pushs pro Tag).
- **Messwert-Latenz:** unverändert.
