## Aktueller Stand

Verbindungen können bereits gelöscht werden — aber nur auf zwei nicht offensichtlichen Wegen:

1. **Toggle über Canvas:** Quellknoten anklicken → Zielknoten anklicken. Existiert die Verbindung bereits, wird sie entfernt.
2. **Knoten-Popover:** Über den Knoten öffnet sich eine Liste der beteiligten Verbindungen mit Entfernen-Aktion.

Die Chip-Liste unten („Verbindungen (5)" — siehe Screenshot) ist aktuell **rein informativ, ohne Löschen-Button**. Das ist der Ort, an dem der User es intuitiv erwartet.

## Änderung

In `src/components/settings/EnergyFlowDesigner.tsx` (Zeilen ~525–540):

- Jeden Verbindungs-Chip um einen kleinen `X`-Button (lucide `X`) ergänzen.
- Klick entfernt die Verbindung per `onChange(nodes, connections.filter((_, idx) => idx !== i))` — analog zur bestehenden Logik im Knoten-Popover (Zeile 449).
- Chip-Styling bleibt (rounded-full, bg-muted), X als `button` mit `hover:text-destructive`, `aria-label="Verbindung entfernen"`.

Keine weiteren Dateien, keine Backend-Änderungen, keine Datenmodell-Anpassung.