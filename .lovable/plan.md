
## 3D-Modell Upload: GLB + OBJ/MTL Unterstuetzung

### Ziel
Nutzer koennen 3D-Modelle ihrer Etagen hochladen. Unterstuetzte Formate: **GLB** (Einzeldatei) und **OBJ + MTL** (Geometrie + Material als Paar).

### Unterstuetzte Formate
- **GLB** -- Einzeldatei mit Geometrie, Materialien und Texturen (empfohlen)
- **OBJ + MTL** -- Zwei Dateien: OBJ fuer Geometrie, MTL fuer Materialien/Farben. Beide werden hochgeladen und beim Laden automatisch verknuepft

### Aenderungen

#### 1. Storage Bucket + Datenbank (SQL-Migration)
- Neuer Storage-Bucket `floor-3d-models` (oeffentlich lesbar)
- RLS-Policies: authentifizierte Nutzer duerfen hochladen, alle duerfen lesen
- Neue Spalte `model_3d_url` (TEXT, nullable) in Tabelle `floors` -- speichert die URL der Hauptdatei (GLB oder OBJ)
- Neue Spalte `model_3d_mtl_url` (TEXT, nullable) in Tabelle `floors` -- speichert die URL der MTL-Datei (nur bei OBJ)

#### 2. Hook-Erweiterung (`src/hooks/useFloors.tsx`)
- `Floor`-Interface um `model_3d_url` und `model_3d_mtl_url` erweitern
- Neue Funktion `upload3DModel(files: {obj: File, mtl?: File} | {glb: File}, locationId, floorId)`:
  - Laedt Dateien in `floor-3d-models/{locationId}/` hoch
  - Aktualisiert `model_3d_url` und ggf. `model_3d_mtl_url` in der Datenbank

#### 3. Upload-Button auf Etagen-Karten (`src/components/locations/FloorList.tsx`)
- Neuer Button "3D-Plan hochladen" (nur fuer Admins, neben bestehendem Grundriss-Button)
- Bei Klick oeffnet sich ein Dialog mit:
  - Datei-Auswahl fuer Hauptdatei (`.glb, .obj`)
  - Bedingte zweite Datei-Auswahl fuer MTL-Datei (erscheint nur wenn OBJ gewaehlt wurde)
  - Upload-Fortschritt und Statusmeldung
- Alternativ: Upload auch in AddFloorDialog und EditFloorDialog integrieren

#### 4. Upload in Add/Edit Dialogen
- **`src/components/locations/AddFloorDialog.tsx`**: Optionaler 3D-Modell-Upload beim Erstellen
- **`src/components/locations/EditFloorDialog.tsx`**: 3D-Modell austauschen/hochladen beim Bearbeiten
- Beide Dialoge erhalten ein Feld fuer die Hauptdatei (.glb/.obj) und ein bedingtes Feld fuer die MTL-Datei

#### 5. 3D-Viewer Erweiterung (`src/components/locations/FloorPlan3DViewer.tsx`)
- Neue Komponente `ModelViewer` innerhalb der Scene:
  - Prüft `floor.model_3d_url` auf Dateiendung
  - `.glb` --> Laden via `useGLTF` aus @react-three/drei
  - `.obj` --> Laden via `OBJLoader` aus `three/examples/jsm/loaders/OBJLoader`
    - Wenn `floor.model_3d_mtl_url` vorhanden: `MTLLoader` aus `three/examples/jsm/loaders/MTLLoader` nutzen, Materialien auf OBJ anwenden
    - Wenn keine MTL: Standard-Material (helles Grau)
- Wenn `model_3d_url` vorhanden: hochgeladenes Modell anzeigen, prozedurale Raeume ausblenden
- Wenn nicht vorhanden: bisherige prozedurale Raeume als Fallback

### Ablauf fuer den Nutzer

```text
GLB-Upload:
  Nutzer waehlt .glb Datei
    --> Upload nach floor-3d-models/{locationId}/{floorId}.glb
    --> URL in floors.model_3d_url gespeichert
    --> 3D-Viewer zeigt Modell an

OBJ+MTL-Upload:
  Nutzer waehlt .obj Datei
    --> Zweites Feld fuer .mtl erscheint
    --> Nutzer waehlt .mtl Datei
    --> Beide Dateien hochgeladen
    --> URLs in floors.model_3d_url + model_3d_mtl_url
    --> 3D-Viewer laedt OBJ mit MTL-Materialien
```

### Betroffene Dateien
- **Neu:** SQL-Migration (Bucket + Spalten)
- **Bearbeiten:** `src/hooks/useFloors.tsx` -- Upload-Funktion, Interface
- **Bearbeiten:** `src/components/locations/FloorList.tsx` -- Upload-Button
- **Bearbeiten:** `src/components/locations/FloorPlan3DViewer.tsx` -- GLB/OBJ+MTL Rendering
- **Bearbeiten:** `src/components/locations/AddFloorDialog.tsx` -- 3D-Upload-Felder
- **Bearbeiten:** `src/components/locations/EditFloorDialog.tsx` -- 3D-Upload-Felder
