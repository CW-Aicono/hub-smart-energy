

## Fix: Grundriss-Upload für Etagen

### Problem
Der Upload von Grundrissen schlägt fehl ("Grundriss konnte nicht hochgeladen werden"). Die `uploadWithProgress`-Funktion nutzt einen manuellen XHR-Request an die Storage-API, was fehleranfällig ist (fehlende CORS-Header, Content-Type-Probleme, etc.).

### Ursachenanalyse
- Der XHR-basierte Upload setzt keinen `Content-Type`-Header — der Browser setzt ihn zwar automatisch bei `File`-Objekten, aber Supabase Storage kann damit Probleme haben
- Zudem fehlt der Response-Body im Error-Handling, sodass der genaue Fehlergrund nicht sichtbar ist
- Alte RLS-Policies ("Admins can upload/update/delete floor plans") wurden nie aufgeräumt und koexistieren mit den neuen Policies — das sollte kein Problem sein (OR-Logik), erhöht aber die Komplexität

### Lösung

**1. Upload-Funktion umstellen (src/hooks/useFloors.tsx)**

Die `uploadWithProgress`-Funktion wird so angepasst, dass sie:
- Den `Content-Type`-Header explizit auf den MIME-Type der Datei setzt
- Den Response-Body bei Fehlern loggt, um Debugging zu ermöglichen
- Als Fallback den Standard-Supabase-SDK-Upload nutzt, falls der XHR fehlschlägt

```typescript
// Im XHR-Setup ergänzen:
xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

// Im Error-Handler den Response-Body loggen:
xhr.addEventListener("load", async () => {
  if (xhr.status >= 200 && xhr.status < 300) {
    // ... bestehende Logik
  } else {
    console.error("Floor plan upload failed:", xhr.status, xhr.responseText);
    resolve({ publicUrl: null, error: new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`) });
  }
});
```

**2. Fallback auf Supabase SDK (src/hooks/useFloors.tsx)**

Falls der XHR-Upload weiterhin fehlschlägt, wird als robustere Alternative der Standard-SDK-Upload genutzt:

```typescript
const { data, error } = await supabase.storage
  .from(bucket)
  .upload(path, file, { upsert: true });
```

Der Progress-Callback wird dann vereinfacht (0% → 100% am Ende).

**3. Alte Storage-Policies aufräumen (Migration)**

Die nicht gelöschten alten Policies bereinigen:
- `DROP POLICY IF EXISTS "Admins can upload floor plans"`
- `DROP POLICY IF EXISTS "Admins can update floor plans"`  
- `DROP POLICY IF EXISTS "Admins can delete floor plans"`

### Dateien
- `src/hooks/useFloors.tsx` — Upload-Funktion mit Content-Type-Header und Fallback
- Neue SQL-Migration — Alte Policies aufräumen

