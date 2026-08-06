
## Impulszähler (Gas / Wasser)

Gas- und Wasserzähler mit Reedkontakt liefern pro Umdrehung einen Impuls
(z. B. 10 Impulse = 1 m³). Der Miniserver rechnet daraus einen Momentanwert
als „Volumen je Impuls ÷ Zeit seit letztem Impuls". Bei kleinem Verbrauch
entstehen dadurch Nadeln mit 1/t-Abklingkurve, die keinen realen Durchfluss
abbilden.

Vorgehen:

1. Am Miniserver die Impulswertigkeit korrekt setzen (z. B. 0,1 m³ je Impuls).
2. Den State **Zählerstand / Gesamt (m³)** zuordnen — nicht den Momentanwert.
3. Im Zähler (Verwaltung → Zähler bearbeiten) den Schalter **Impulszähler
   (Reedkontakt)** aktivieren und optional das Volumen je Impuls eintragen.

Ab Worker v1.18 ignoriert der WS-Worker bei aktivem Impulszähler-Schalter jeden
Momentanwert und bildet den 5-Minuten-Verlauf aus der Zählerstandsdifferenz,
gleichmäßig über die vergangene Zeit verteilt (Step-Hold). Bei Gas wird die
Volumendifferenz über Brennwert × Zustandszahl in kW umgerechnet.
