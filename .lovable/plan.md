# Patch: Live-Updates aktivieren + Zählerstände (Mr) mitlesen

## Vorab: Ehrliche Größeneinschätzung

Du hast B gewählt ("beides in einem Patch"). Ich mache das gerne, **muss aber transparent sein**, dass die zwei Teile **sehr unterschiedlich groß** sind:


| Teil                                                          | Aufwand                                                             | Risiko                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------- |
| **A — LoxAPP3-Fix** (Live-Updates aktivieren)                 | 6 Zeilen Code, 1 Rebuild                                            | minimal, gut diagnostizierbar    |
| **B — Mr-Zählerstände** (zusätzliche UUIDs lesen + speichern) | Worker-Änderung + Edge-Function-Änderung + DB-Migration + UI später | mittel, mehrere bewegliche Teile |


**Wenn nach dem Patch keine Live-Werte ankommen, wissen wir bei B nicht sofort, ob es an LoxAPP3, an der Mr-Parsing-Logik oder am Push-Pfad liegt.** Wir landen schneller bei der HARD-STOP-Regel.

Mein Vorschlag (auch wenn du B gewählt hast): **die Arbeit als „ein Plan, zwei Rebuilds"** ausführen. Konkret:

- **Rebuild 1 (phase6.3-loxapp3):** Nur LoxAPP3-Fix. 2 Min beobachten. Wenn DB zeigt „Werte ändern sich" → bewiesen.
- **Rebuild 2 (phase6.4-mr):** Erst danach Mr-Logik dazu. Wenn dabei was bricht, ist die Ursache eindeutig.

Beide Rebuilds passieren am selben Abend, du hast in 30 Min beides live. Aber sauber trennbar.

**Wenn du trotzdem alles in einen Rebuild willst:** sag „mach alles auf einmal", dann führe ich Schritte 1–6 zusammen aus.

---

## Schritt 1 — LoxAPP3-Fix (Rebuild 1)

### Code-Änderung in `docs/loxone-ws-worker/index.ts`

Direkt **vor** dem `enablebinstatusupdate`-Call in `runConnect()`:

```ts
// Loxone-Requirement: Strukturdatei muss 1x nach Auth abgerufen werden,
// sonst sendet der Miniserver keine Status-Änderungen (nur Initial-Snapshot).
try {
  await socket.send("data/LoxAPP3.json");
  log("info", `[WS] ${state.serialNumber} LoxAPP3.json geladen — Live-Updates aktiviert`);
} catch (err) {
  log("warn", `[WS] ${state.serialNumber} LoxAPP3.json fehlgeschlagen: ${(err as Error).message}`);
}
```

Version-Stamp: `phase6.2-diagnose` → `phase6.3-loxapp3`.

### Validierung (nach Rebuild)

```bash
docker logs --since 3m loxone-ws-worker 2>&1 | grep -E "LoxAPP3|version="
```

Erwartung: `LoxAPP3.json geladen — Live-Updates aktiviert` pro Miniserver.

Dann 3 Min warten, DB-Check (mache ich für dich): unterschiedliche Werte pro Minute auf Sensoren, die sich physisch ändern (z. B. Hausverbrauch, PV).

**Wenn ja → A erfolgreich, weiter zu Schritt 2.**
**Wenn nein → HARD STOP, neue Diagnose.**

---

## Schritt 2 — Mr-Zählerstände (Rebuild 2)

### Konzept

Aus der bereits abgerufenen `LoxAPP3.json` parsen wir alle Meter-Bausteine. Jeder Baustein hat einen `states`-Block, z. B.:

```json
"states": {
  "actual": "20cebdeb-01ad-53c9-ffff202962292d0b",   // Pf
  "total":  "20cebdeb-01ad-53ca-ffff202962292d0b",   // Mr
  "todayConsumption": "...",
  ...
}
```

Für jede konfigurierte Pf-UUID suchen wir die zugehörige Mr-UUID über den `controls`-Baum. Das ist **deterministisch** und **validiert** — kein Raten an UUID-Mustern.

### Code-Änderungen

**Worker (`docs/loxone-ws-worker/index.ts`):**

1. LoxAPP3-Response per `socketOnFileReceived` einsammeln (statt nur Side-Effect).
2. JSON parsen, `controls`-Objekt durchgehen, für jeden Pf-UUID die Mr-UUID extrahieren → `pfToMrMap`.
3. Mr-UUIDs zusätzlich per `jdev/sps/io/<mr-uuid>/all` abonnieren.
4. `UuidEntry` um `cumulative_value` + `last_pushed_cumulative` erweitern.
5. Flush sendet pro Sample jetzt `{sensor_uuid, value, cumulative_value?}`.

**Edge-Function `gateway-ingest` (Action `bridge-readings`):**

- Akzeptiert optionales `cumulative_value`-Feld.
- Schreibt in zusätzliche Spalte `cumulative_value numeric NULL` in `bridge_raw_samples`.

**DB-Migration:**

```sql
ALTER TABLE bridge_raw_samples ADD COLUMN cumulative_value numeric NULL;
```

(reine Erweiterung, keine bestehenden Daten betroffen)

**NICHT in diesem Patch:**

- UI für Anzeige der Mr-Werte
- Anpassung des Aggregators, der die Mr-Werte als Quelle nutzt
- Migration der bestehenden Zählerstand-Erfassung (history_correction etc.)

Diese drei Punkte sind eigene Folge-Tasks — sonst sprengt es jede Rebuild-Sitzung.

### Validierung (nach Rebuild 2)

```bash
docker logs --since 3m loxone-ws-worker 2>&1 | grep -E "Mr-Mapping|pfToMr"
```

Erwartung: pro Miniserver Log „pfToMr-Mapping: N Paare gefunden".

DB-Check (mache ich): `bridge_raw_samples` enthält Zeilen mit `cumulative_value IS NOT NULL` und Werten, die zum echten Zählerstand passen (z. B. `8894.541` für „UV Süd Mr" laut deinem Screenshot).

---

## Risiken & Stoplinien

- **Risiko A:** LoxAPP3.json bringt nicht die erwartete Wirkung → HARD STOP nach Rebuild 1, neue Diagnose (z. B. Token-Permissions am Miniserver).
- **Risiko B:** LoxAPP3.json zu groß / Timeout → Fallback: nur `app3/jdev/sps/LoxAPP3.json` (sollte aber bei eurer Größe kein Problem sein).
- **Risiko C:** `controls`-Struktur in der Praxis abweichend → Logging zeigt das sofort, dann gezielter Fix.

## Was ändert sich NICHT

- Kein Eingriff in Cloud-UI, Dashboards, bestehende Polling-Pfade, bestehende Meter-Konfiguration.
- Bestehende Loxone-Polling-Integration läuft unverändert weiter.

---

**Bitte bestätige:**

- **"Schritt 1 starten"** → ich mache nur den LoxAPP3-Fix, du rebuildest, wir prüfen, dann Schritt 2.
- **"Alles auf einmal"** → ich packe Schritt 1 + 2 in einen Patch (höheres Risiko, schwerer zu diagnostizieren).  
  
Antwort: Schritt 1 starten, dann rebuild und prüfen. Schritt 2 machen wir separat.  
  
  
  