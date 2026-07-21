## Ursache

In `src/components/locations/LocationTree.tsx` (Zeile 291–295) wird entschieden, ob Etagen/Räume/Zähler unter einer Liegenschaft angezeigt werden:

```ts
const isEinzelgebaeude = location.type === "einzelgebaeude";
const isChildOfComplex = level > 0;
const shouldShowFloors = isEinzelgebaeude || isChildOfComplex;
```

Damit gilt:

- **Einzelgebäude** auf Root-Ebene → Etagen werden geladen und angezeigt ✅
- **Gebäudekomplex** auf Root-Ebene ohne Kind-Standorte → `shouldShowFloors = false`, `useFloors` wird nie aufgerufen, kein Expand-Chevron ❌

Auf Lovable (Screenshot 1) sind alle sichtbaren Liegenschaften vom Typ **Einzelgebäude** — deshalb funktioniert die Baumdarstellung dort.
Auf Hetzner (Screenshot 2) ist „Zentrale Jüke" vom Typ **Gebäudekomplex** und hat keine Kind-Locations, sondern Etagen/Räume/Zähler direkt an der Liegenschaft hängen (Screenshot 3 bestätigt: EG mit Räumen und Zählern, OG etc.). Der Baum erwartet aber, dass ein Gebäudekomplex ausschließlich als Container für weitere Standorte dient — deshalb wird nichts angezeigt und der Ordner ist nicht aufklappbar.

Es ist **kein** Sync-, Cache- oder RLS-Problem. Die gleichen Daten würden auch auf Lovable so aussehen, wenn dort eine Root-Location als „Gebäudekomplex" ohne Kinder existierte.

## Fix

Regel korrigieren, sodass Etagen immer geladen werden, wenn die Liegenschaft keine Kind-Standorte hat — egal welcher Typ:

```ts
const hasChildren = location.children && location.children.length > 0;
const shouldShowFloors = isEinzelgebaeude || isChildOfComplex || !hasChildren;
```

Damit:

- Einzelgebäude → wie bisher Etagen direkt
- Gebäudekomplex **mit** Kind-Standorten → wie bisher nur die Kinder (Etagen hängen an den Kindern)
- Gebäudekomplex **ohne** Kind-Standorte (Fall Hetzner „Zentrale Jüke") → Etagen/Räume/Zähler werden direkt angezeigt
- Kind-Standorte innerhalb eines Komplexes → wie bisher Etagen

## Betroffene Datei

- `src/components/locations/LocationTree.tsx` — nur die Berechnung von `shouldShowFloors` in `LocationNode` (eine Zeile).

## Verifizierung nach der Umsetzung

1. Bestehender Test `src/components/__tests__/LocationTree.test.tsx` läuft unverändert.
2. Manuell im Preview: eine Root-Liegenschaft auf „Gebäudekomplex" umstellen, die Etagen enthält — Baum muss aufklappbar sein und Etagen/Räume/Zähler zeigen.
3. Auf Hetzner nach Deploy: „Zentrale Jüke" zeigt EG/OG samt Räumen und Zählern wie im Screenshot 3 sichtbar.