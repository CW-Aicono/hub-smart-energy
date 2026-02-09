
# Plan: 3D-Grundriss mit virtueller Begehung

## Übersicht

Implementierung eines interaktiven 3D-Grundriss-Viewers mit prozedural generierten Räumen, First-Person-Navigation (WASD + Maus) und platzierbaren Sensor-Overlays. Die Lösung integriert sich nahtlos in die bestehende Grundriss-Verwaltung.

## Architektur

```text
┌─────────────────────────────────────────────────────────────────┐
│                    FloorPlanDialog.tsx                          │
│  ┌──────────┬─────────────────────┬───────────────────────┐     │
│  │ Ansicht  │ Messgeräte bearbeiten │ 3D-Begehung (NEU)   │     │
│  └──────────┴─────────────────────┴───────────────────────┘     │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │              FloorPlan3DViewer.tsx                      │     │
│  │  ┌─────────────────────────────────────────────────┐   │     │
│  │  │  React Three Fiber Canvas                       │   │     │
│  │  │  ┌─────────────┐  ┌──────────────────────────┐  │   │     │
│  │  │  │ FirstPerson │  │ RoomGeometry (Wände)     │  │   │     │
│  │  │  │ Controls    │  │ - Aus Raumdaten generiert│  │   │     │
│  │  │  └─────────────┘  └──────────────────────────┘  │   │     │
│  │  │                   ┌──────────────────────────┐  │   │     │
│  │  │                   │ Sensor3DLabels           │  │   │     │
│  │  │                   │ - Aus floor_sensor_      │  │   │     │
│  │  │                   │   positions geladen      │  │   │     │
│  │  │                   └──────────────────────────┘  │   │     │
│  │  └─────────────────────────────────────────────────┘   │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Komponenten

### 1. Raumdefinitions-Editor
Ein einfacher Editor zum Definieren von Räumen für eine Etage:
- Rechteckige Räume mit Position (x, y) und Größe (Breite, Tiefe)
- Türöffnungen zwischen Räumen
- Wandhöhe (Standard: 2.8m)

### 2. 3D-Viewer mit First-Person-Steuerung
- WASD für Bewegung (vorwärts, links, rückwärts, rechts)
- Maus für Blickrichtung (Pointer Lock)
- Leertaste zum Springen
- ESC zum Verlassen des Steuerungsmodus

### 3. Sensor-Integration
- Bestehende `floor_sensor_positions` werden in 3D-Koordinaten umgewandelt
- Sensor-Labels schweben über dem Boden mit Live-Werten
- Labels drehen sich zur Kamera (Billboard-Effekt)

## Datenbank-Erweiterung

Neue Tabelle `floor_rooms` zur Speicherung der Raumdefinitionen:

```sql
CREATE TABLE floor_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position_x NUMERIC NOT NULL DEFAULT 0,
  position_y NUMERIC NOT NULL DEFAULT 0,
  width NUMERIC NOT NULL DEFAULT 4,
  depth NUMERIC NOT NULL DEFAULT 4,
  wall_height NUMERIC NOT NULL DEFAULT 2.8,
  color TEXT DEFAULT '#f0f0f0',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

Erweiterung der `floor_sensor_positions` um 3D-Koordinaten:

```sql
ALTER TABLE floor_sensor_positions
ADD COLUMN position_z NUMERIC DEFAULT 1.5,
ADD COLUMN room_id UUID REFERENCES floor_rooms(id) ON DELETE SET NULL;
```

## Neue Dateien

| Datei | Beschreibung |
|-------|--------------|
| `src/components/locations/FloorPlan3DViewer.tsx` | Haupt-3D-Canvas mit React Three Fiber |
| `src/components/locations/Floor3DControls.tsx` | First-Person-Steuerung (WASD + Maus) |
| `src/components/locations/Room3D.tsx` | Einzelner Raum aus Wand-Geometrien |
| `src/components/locations/Sensor3DLabel.tsx` | Billboard-Label für Sensor-Werte |
| `src/components/locations/RoomEditor.tsx` | Editor zum Definieren der Räume |
| `src/hooks/useFloorRooms.tsx` | Hook für CRUD-Operationen auf Räume |

## Änderungen an bestehenden Dateien

### FloorPlanDialog.tsx
- Neuer Tab "3D-Begehung" für Admins und Viewer
- Lazy-Loading des 3D-Viewers für Performance

### useFloorSensorPositions.tsx
- Erweiterung um `position_z` und `room_id`

## Abhängigkeiten

```json
{
  "@react-three/fiber": "^8.18.0",
  "@react-three/drei": "^9.122.0",
  "three": "^0.170.0",
  "@types/three": "^0.170.0"
}
```

Hinweis: Version 8.x für @react-three/fiber ist erforderlich wegen React 18-Kompatibilität.

## Benutzerablauf

### Räume definieren (Admin)
1. Öffnet Grundriss-Dialog einer Etage
2. Wechselt zu Tab "3D-Begehung"
3. Klickt "Räume bearbeiten"
4. Fügt rechteckige Räume hinzu (Name, Position, Größe)
5. Speichert die Raumkonfiguration

### 3D-Begehung starten
1. Klickt "Begehung starten" im 3D-Tab
2. Maus wird gesperrt (Pointer Lock)
3. Bewegt sich mit WASD durch die Räume
4. Sieht Sensor-Werte als schwebende Labels
5. ESC zum Beenden

### Sensoren im 3D-Raum platzieren
1. Im Editor-Modus Sensor aus Liste wählen
2. In 3D-Ansicht auf Wand oder Boden klicken
3. Position wird mit x/y/z gespeichert

## UI-Mockup

```text
┌────────────────────────────────────────────────────────────────┐
│  Erdgeschoss - Grundriss                           [Vollbild] │
├────────────────────────────────────────────────────────────────┤
│  [Ansicht] [Messgeräte bearbeiten] [3D-Begehung]              │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                                                          │ │
│  │     ╔══════════════╗    ╔══════════════╗                │ │
│  │     ║   Büro 1     ║    ║   Büro 2     ║                │ │
│  │     ║              ║    ║              ║                │ │
│  │     ║  [23.5°C]    ║    ║  [21.2°C]    ║                │ │
│  │     ║              ║    ║              ║                │ │
│  │     ╠══════════════╣    ╠══════════════╣                │ │
│  │     ║              Flur               ║                  │ │
│  │     ╚══════════════════════════════════╝                │ │
│  │                                                          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  [Räume bearbeiten]              [Begehung starten →]         │
│                                                                │
│  Steuerung: WASD = Bewegen | Maus = Umsehen | ESC = Beenden  │
└────────────────────────────────────────────────────────────────┘
```

## Technische Details

### First-Person-Controls
```typescript
// Vereinfachte Logik für Bewegungssteuerung
const MOVE_SPEED = 5;
const keys = { w: false, a: false, s: false, d: false };

useFrame((state, delta) => {
  const direction = new Vector3();
  if (keys.w) direction.z -= 1;
  if (keys.s) direction.z += 1;
  if (keys.a) direction.x -= 1;
  if (keys.d) direction.x += 1;
  
  direction.normalize().multiplyScalar(MOVE_SPEED * delta);
  camera.position.add(direction.applyQuaternion(camera.quaternion));
});
```

### Raum-Geometrie
```typescript
// Wände als BoxGeometry mit Loch für Türen
function Room({ position, width, depth, height, doorPositions }) {
  return (
    <group position={position}>
      {/* Boden */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#e0e0e0" />
      </mesh>
      
      {/* Wände (4 Seiten) */}
      {walls.map((wall, i) => (
        <mesh key={i} position={wall.position}>
          <boxGeometry args={[wall.width, height, 0.1]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  );
}
```

### Sensor Billboard-Labels
```typescript
<Billboard follow={true} lockX={false} lockY={false}>
  <Html center distanceFactor={10}>
    <div className="bg-card/95 rounded-lg px-2 py-1">
      <p className="text-xs">{sensor.name}</p>
      <p className="text-sm font-bold">{value} {unit}</p>
    </div>
  </Html>
</Billboard>
```

## Implementierungsreihenfolge

1. **Dependencies installieren** - React Three Fiber + Drei + Three.js
2. **Datenbank-Migration** - `floor_rooms` Tabelle + Erweiterung `floor_sensor_positions`
3. **useFloorRooms Hook** - CRUD für Räume
4. **Room3D Komponente** - Einzelner Raum aus Geometrien
5. **Floor3DControls** - First-Person-Steuerung
6. **Sensor3DLabel** - Billboard mit Messwerten
7. **FloorPlan3DViewer** - Haupt-Canvas mit allen Komponenten
8. **RoomEditor** - UI zum Definieren der Räume
9. **FloorPlanDialog erweitern** - Neuer Tab "3D-Begehung"
10. **Sensor-Platzierung in 3D** - Klick-Positionierung im Raum

## Einschränkungen

- **Nur rechteckige Räume**: Komplexere Formen (L-förmig, rund) werden zunächst nicht unterstützt
- **Keine Physik-Kollision**: Der Nutzer kann durch Wände laufen (Kollisionserkennung wäre Erweiterung)
- **Einfache Materialien**: Keine Texturen, nur Farben
- **Keine Möblierung**: Räume sind leer, nur Wände und Sensoren

## Erweiterungsmöglichkeiten (Zukunft)

- Kollisionserkennung mit `@react-three/rapier`
- Import von GLTF-Modellen für realistische Räume
- Möbel und Objekte hinzufügen
- Minimap-Übersicht
- VR-Unterstützung mit WebXR
