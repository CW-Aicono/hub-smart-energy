## Korrigierte Ursache

Du hast recht — die obere Tabelle zeigt **nur virtuelle und manuelle Zähler**, nicht alle. Das kommt aus der Deduplizierungs-Logik in `src/components/locations/MeterManagement.tsx`:

```ts
// Zeile 495–498
const meterTypeMeters = activeMeters.filter(
  (m) =>
    ((m as any).device_type === "meter" || !(m as any).device_type) &&
    !(m.sensor_uuid && gatewayDeviceIds.has(m.sensor_uuid)),
);
// Zeile 508
const displayedMeters = showArchived ? archivedMetersByType : meterTypeMeters;
```

Zähler mit `sensor_uuid`, das vom Gateway geliefert wird, werden aus der oberen Tabelle **ausgeblendet** und stattdessen nur in der unteren „Vom Gateway gelieferte Zähler-Geräte"-Tabelle angezeigt (`assignedMeterDevices`, Zeile 913 ff.). Die obere Tabelle enthält damit ausschließlich:
- virtuelle Zähler (z. B. „Ladeinfrastruktur" auf Hetzner)
- rein manuelle Zähler ohne Gateway-Bindung

Der eigentliche Bug ist die **Verschachtelung der Bulk-Toolbar** (Zeilen 720–796):

```tsx
) : displayedMeters.length === 0 ? (
  <p>Keine Zähler angelegt.</p>
) : (
  <>
    {isAdmin && selectedMeterIds.size > 0 && (
      /* ⬅ Toolbar sitzt HIER, im else-Zweig */
    )}
    <Table>…</Table>
  </>
)}
{/* Gateway-Devices-Tabelle steht danach — außerhalb des if/else */}
```

Beide Tabellen (obere Virtuell/Manuell + untere Gateway-Devices) schreiben in dieselbe `selectedMeterIds`-Set. Aber die Toolbar wird **nur gerendert, wenn `displayedMeters` nicht leer ist**.

- **Hetzner**: 1 virtueller Zähler „Ladeinfrastruktur" existiert → `displayedMeters.length > 0` → Toolbar wird gerendert → Auswahl der 15 Gateway-Zähler unten ergibt sichtbar „15 ausgewählt".
- **Lovable**: keine virtuellen oder manuellen Zähler → `displayedMeters.length === 0` → Empty-State-Text „Keine Zähler angelegt." → Toolbar existiert im DOM überhaupt nicht, obwohl unten Gateway-Zähler selektiert sind.

## Fix

**Datei**: `src/components/locations/MeterManagement.tsx`

1. **Toolbar aus dem `else`-Zweig herausziehen** und vor die `displayedMeters.length === 0 ? … : …`-Verzweigung platzieren (Zeilen 718–796). So bleibt sie sichtbar, sobald `selectedMeterIds.size > 0` — egal ob die obere Tabelle leer ist oder nicht.

2. **„Select all"-Verhalten anpassen** (Zeile 803–807): Die „Alle auswählen"-Checkbox in der oberen Table-Header sollte nur alle `displayedMeters` toggeln (bleibt so). Sie steuert bewusst nicht die Gateway-Devices-Tabelle darunter — diese hat eine eigene Header-Checkbox (`toggleSelectAll` → `DeviceTable`, Zeilen 934/935), was korrekt bleibt.

3. **Empty-State-Text zusätzlich einblenden**: „Keine Zähler angelegt." weiterhin zeigen, wenn `displayedMeters.length === 0` — aber unabhängig davon die Toolbar oberhalb rendern, damit Bulk-Aktionen für die unten selektierten Gateway-Zähler funktionieren.

4. **Analog Sensoren- & Aktoren-Tab prüfen** (Zeilen ~1030, ~1178). Struktur ist parallel aufgebaut; dort dieselbe Umstellung, falls das gleiche Verschachtelungs-Muster verwendet wird.

## Umfang

- 1 Datei, rein strukturelle JSX-Umsortierung.
- Kein Datenbank-, RLS-, oder Backend-Änderung.
- Keine Business-Logik-Änderung — `selectedMeterIds` und die Bulk-Handler bleiben unverändert.
