
## Begehung im Dashboard ermöglichen

### Problem
Aktuell wird die First-Person-Begehung im Dashboard durch zwei Bedingungen blockiert:
1. Die Controls-Bar mit dem "Begehung starten"-Button wird im `compact`-Modus nicht angezeigt
2. Die `Floor3DControls` (WASD-Steuerung) werden nur gerendert, wenn `readOnly` **nicht** aktiv ist

### Loesung

**Datei: `src/components/locations/FloorPlan3DViewer.tsx`**

1. **Begehungs-Button auch im readOnly/compact-Modus anzeigen**: Ein schlanker, schwebender Button wird ueber dem 3D-Canvas eingeblendet, wenn `compact` aktiv ist -- damit der Benutzer die Begehung starten und beenden kann, ohne die volle Admin-Toolbar zu brauchen.

2. **Floor3DControls auch im readOnly-Modus erlauben**: Die Bedingung wird von `!readOnly && isWalking` auf `isWalking` geaendert. Die Begehung ist rein lesend (nur Kamera-Bewegung), es werden keine Daten veraendert -- daher ist sie im readOnly-Modus unbedenklich.

3. **OrbitControls bei Begehung deaktivieren**: Die bestehende Bedingung `readOnly && !isWalking` stellt bereits sicher, dass OrbitControls waehrend der Begehung ausgeschaltet werden.

### Aenderungen im Detail

```text
Zeile 422: !readOnly && isWalking  -->  isWalking
           (erlaubt Begehung auch im Dashboard)

Zeile 527-571: Zusaetzlicher schwebender Button im compact-Modus
               (Play/Stop-Button unten links ueber dem Canvas)

Zeile 607-615: Status-Bar auch im compact/readOnly-Modus anzeigen
               (WASD-Hinweise)
```

### Ergebnis
- Im Dashboard erscheint ein schwebender "Begehung starten"-Button ueber dem 3D-Modell
- Klick aktiviert die First-Person-Steuerung (WASD + Maus)
- Ein "Beenden"-Button erscheint zum Verlassen
- Keine Admin-Funktionen (Raum-Editor, Rotation, Meter-Verschiebung) werden freigeschaltet
