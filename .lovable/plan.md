
## Problem: Beschädigter Code durch fehlerhaftes Editing

Der letzte automatische Fix ("catch ohne Variable") hat versehentlich **kritische Logik aus zwei `onMsg`-Handlern entfert**:

### Was fehlt (Zeilen 311–316):
```typescript
// VORHER (korrekt):
try { parsed = JSON.parse(msg); } catch (_e) { return; }
const ll = parsed?.LL;
if (!ll) return;
if (typeof ll.control === "string" && ll.control.includes("keyexchange")) {
  clearTimeout(timeout);
  ...
}

// NACHHER (beschädigt):
try { parsed = JSON.parse(msg); } catch (_e) { return; }
  clearTimeout(timeout);   // ← ll ist nie definiert!
  ...
  const code = ll.Code     // ← TS1128: ll existiert nicht im Scope
```

Identisch kaputt: der `getkey2`-Handler (Zeilen 348–359).

### Lösung

Die Datei `docs/gateway-worker/index.ts` wird an **2 Stellen** repariert — die fehlenden 3 Zeilen werden wieder eingefügt:

**Fix 1 — keyexchange onMsg (um Zeile 311):**
```typescript
try { parsed = JSON.parse(msg); } catch (_e) { return; }
const ll = parsed?.LL;          // ← wiederherstellen
if (!ll) return;                 // ← wiederherstellen
if (typeof ll.control === "string" && ll.control.includes("keyexchange")) {  // ← wiederherstellen
  clearTimeout(timeout);
  ws.removeListener("message", onMsg);
  const code = ll.Code ?? ll.code;
  resolve(code === "200" || code === 200);
}
```

**Fix 2 — getkey2 onMsg (um Zeile 348):**
```typescript
try { parsed = JSON.parse(msg); } catch (_e) { return; }
const ll = parsed?.LL;          // ← wiederherstellen
if (!ll) return;                 // ← wiederherstellen
if (typeof ll.control === "string" && ll.control.includes("getkey2")) {  // ← wiederherstellen
  clearTimeout(timeout);
  ws.removeListener("message", onMsg);
  const val = ll.value as any;
  ...
}
```

Alle anderen Dateien bleiben unberührt.

---

## Schritt-für-Schritt Anleitung nach dem Fix

### Schritt 1: Alten Container stoppen (falls noch läuft)
```bash
docker stop gateway-worker
docker rm gateway-worker
```

### Schritt 2: `index.ts` auf dem Pi aktualisieren
```bash
nano ~/gateway-worker/index.ts
```
Alten Inhalt vollständig löschen: `Ctrl+A` → dann `Ctrl+K` (ggf. mehrfach)  
Neuen Inhalt aus Lovable (Datei `docs/gateway-worker/index.ts`) einfügen  
Speichern: `Ctrl+X` → `Y` → `Enter`

### Schritt 3: Docker-Image neu bauen
```bash
cd ~/gateway-worker
docker build -t gateway-worker .
```
Erwartetes Ende:
```
Successfully built <id>
Successfully tagged gateway-worker:latest
```

### Schritt 4: Container starten
```bash
docker run -d --name gateway-worker --restart unless-stopped \
  -e SUPABASE_URL="https://xnveugycurplszevdxtw.supabase.co" \
  -e GATEWAY_API_KEY="sk_live_odclyxINkLa0XcHuIXbeeNw44lwzzDHp" \
  -e FLUSH_INTERVAL_MS=1000 \
  gateway-worker
```

### Schritt 5: Logs prüfen
```bash
docker logs -f gateway-worker
```

Erwartete Logs (Erfolg):
```
[INFO] [Loxone] Key exchange successful: 504F94D107EE
[INFO] [Loxone] Token acquired: 504F94D107EE (valid until: 2026-03-19)
[INFO] [Loxone] Authenticated: 504F94D107EE
[INFO] [Loxone] Status updates enabled: 504F94D107EE
[INFO] ✓ Flush: 41 inserted (1001ms)
[INFO] ✓ Flush: 41 inserted (999ms)
```

Abbrechen der Log-Ansicht: `Ctrl+C` (Container läuft weiter)
