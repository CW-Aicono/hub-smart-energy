
## Etage und Raum im "Zähler bearbeiten"-Dialog

Der aktuelle "Zähler bearbeiten"-Dialog (`EditMeterDialog.tsx`) enthält keine Felder zur Zuordnung von Etage und Raum. Diese werden ergänzt, analog zum bestehenden `AssignMeterDialog`.

### Änderungen

**Datei: `src/components/locations/EditMeterDialog.tsx`**

1. **Neue State-Variablen** fuer `selectedFloorId`, `selectedRoomId`, `floors` und `rooms` hinzufuegen
2. **Floors laden** wenn der Dialog geoeffnet wird (basierend auf `meter.location_id`), mit Auto-Selektion bei nur einer Etage
3. **Rooms laden** wenn eine Etage ausgewaehlt wird
4. **Initiale Werte** aus `meter.floor_id` und `meter.room_id` uebernehmen
5. **UI-Felder** fuer Etage und Raum im Zuordnungs-Bereich ergaenzen (zwischen "Medium" und "Hauptzaehler"-Sektion), mit Icons (Layers, DoorOpen) wie im AssignMeterDialog
6. **handleSubmit** erweitern um `floor_id` und `room_id` mitzuspeichern (null wenn nicht gewaehlt)

### Technische Details

- Die Floor-/Room-Logik folgt exakt dem Muster aus `AssignMeterDialog.tsx` (Supabase-Queries auf `floors` und `floor_rooms` Tabellen)
- Auto-Selektion: Hat das Gebaude nur eine Etage, wird diese automatisch vorausgewaehlt. Hat die Etage nur einen Raum, wird dieser ebenfalls automatisch vorausgewaehlt
- Die Felder sind optional (kein Pflichtfeld)
- `floor_id` und `room_id` werden in `onSave` als Teil der Updates mitgegeben
