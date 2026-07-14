## Ziel
Custom-Widget „Energieflussmonitor" bekommt ein **radiales Default-Layout** wie in der Loxone-App: fester, unbeschrifteter Zentralknoten in der Mitte, User-Knoten werden beim Hinzufügen automatisch gleichmäßig auf einem Kreis um das Zentrum verteilt. Verbindungen zum Zentrum werden automatisch gezeichnet. Der User kann äußere Knoten weiterhin per Drag & Drop frei umpositionieren; ein Reset-Button stellt die radiale Default-Anordnung wieder her.

## Änderungen

### 1. Datenmodell
- Kein neues Feld, keine DB-Migration.
- Zentralknoten ist **implizit** (nicht in `nodes[]`), wird immer in der Mitte gerendert, keine Beschriftung, keine Werte, nicht auswählbar.
- `connections` werden **automatisch zur Laufzeit** aus den vorhandenen Knoten generiert (jeder User-Knoten ↔ Zentrum). Bestehende gespeicherte `connections` werden ignoriert.
- `node.x` / `node.y` bleiben erhalten und speichern die (ggf. per Drag & Drop überschriebene) Position in Prozent des Container-Rechtecks. Beim Neuanlegen eines Knotens werden sie mit der radialen Default-Position vorbelegt.

### 2. Radiales Default-Layout (Utility)
- Neue Helper-Funktion `computeRadialDefault(index, total)` → `{x, y}` in Prozent:
  - Zentrum = (50, 50).
  - Radius = 34 (Prozent, lässt Platz für Labels/Werte).
  - Winkel = `-90° + index * (360°/total)` (erster Knoten oben, im Uhrzeigersinn).
- Wird verwendet:
  - beim **Anlegen** eines neuen Knotens (Designer).
  - beim **Reset** (Designer).
  - als Fallback, wenn ein bestehender Knoten weder gespeichertes `x` noch `y` hat.

### 3. `src/components/dashboard/EnergyFlowMonitor.tsx`
- Zusätzlichen impliziten **Zentralknoten** rendern: Kreis mit dezenter Umrandung, kein Icon, kein Label, keine Werte, kein Click-Handler.
- Verbindungen ignorieren die gespeicherte `connections`-Prop und werden zur Laufzeit als „jeder Node → Zentrum" erzeugt. Flow-Animation/Farblogik/Richtung nach Vorzeichen der Live-Leistung bleiben unverändert; der Zentrumsknoten ist neutrale Gegenseite jeder Linie.
- `nodePos()` nutzt weiterhin `node.x/node.y` (jetzt radial vorbelegt).
- Widget-Ansicht auf dem Dashboard bleibt **nicht** interaktiv (nur Anzeige).

### 4. `src/components/settings/EnergyFlowDesigner.tsx`
- **Beibehalten:** Drag & Drop der äußeren Knoten inkl. bestehendem `dragRef`/Mausevents; Knoten hinzufügen/entfernen; Rolle/Zähler/Label/Farbe editieren.
- **Neu beim Hinzufügen:** neuer Knoten bekommt `x/y` aus `computeRadialDefault(newIndex, newTotal)` statt fest 50/50. Damit landet er automatisch auf gleichem Radius und gleichem Winkelabstand.
- **Neu: Reset-Button** („Anordnung zurücksetzen") oben rechts über dem Layout-Panel:
  - Setzt alle Knoten in `nodes[]` neu: `nodes.map((n, i) => ({ ...n, x, y: computeRadialDefault(i, nodes.length) }))`.
  - Löst Bestätigung via `AlertDialog` aus („Alle manuellen Positionen werden zurückgesetzt.").
- **Zentralknoten** wird als unbewegliche Vorschau in der Mitte gezeichnet, damit der User die radiale Anordnung sieht.
- **Entfernt:** UI zum manuellen Anlegen/Löschen von Verbindungen (Connections sind jetzt implizit). Vorhandene Utility-Funktionen bleiben, werden nur nicht mehr aufgerufen.

### 5. `src/components/settings/WidgetPreview.tsx`
- Nutzt weiterhin denselben `EnergyFlowMonitor`; automatisch konsistent mit neuem Layout und Zentralknoten. Keine weitere Anpassung nötig.

### 6. Migration bestehender Widgets
- Renderer ignoriert alte `connections`. Bestehende `x/y`-Werte bleiben respektiert (der User hatte sie bewusst gesetzt). Über den neuen Reset-Button kann er auf das radiale Default umschalten.

## Nicht Teil dieser Änderung
- Farb-/Icon-System, Live-Daten-Hooks, SOC-Logik, i18n bleiben unverändert.
- Kein neues DB-Feld für Winkel/Radius.

## Offene Rückfrage
Reihenfolge der Knoten (= Default-Winkelreihenfolge, 12 Uhr → im Uhrzeigersinn) folgt der Einfügereihenfolge in `nodes[]`. Falls du stattdessen eine feste Rollen-Sortierung willst (z. B. Netz oben, Verbrauch rechts, Speicher unten, Produktion links wie im Loxone-Screenshot), sag Bescheid — dann sortiere ich vor dem Layout automatisch nach Rolle.