## Ziel

Neuer Sub-Tab **„Injektor"** unter `/super-admin/loxone-templates`. Nutzer lädt eine `.Loxone`-Datei (XML) hoch, wählt pro AICO-Baustein die gewünschte Instanz-Anzahl, bekommt eine Vorschau, und lädt eine erweiterte `.Loxone`-Datei herunter. Bestehende Objekte in der Ziel-Datei bleiben **byteidentisch**.

## Machbarkeit

Ja, vollständig umsetzbar. Die Beispieldatei ist reines UTF-8-XML mit BOM/CRLF. Die beschriebene Python-Referenzlogik lässt sich 1:1 in TypeScript als reine String-/Regex-Verarbeitung im Browser abbilden — kein Backend, kein XML-DOM-Rewrite nötig. Die Datei bleibt clientseitig (kein Upload in die Cloud, kein DSGVO-Risiko).

## Architektur

Alles clientseitig in React/TS. Keine neuen Tabellen, keine Edge Function.

```text
Super-Admin
└── Loxone-Templates
    ├── Katalog (bestehend)
    ├── Health-Report (bestehend)
    ├── Master-Projekt (bestehend)
    └── Injektor  ← NEU
         │
         ├── 1. Bibliothek (AICONO_Master.Loxone)
         │      Quelle A: aus Storage-Bucket "loxone-master"
         │                (neueste Version automatisch)
         │      Quelle B: optionaler manueller Upload (Override)
         │
         ├── 2. Ziel-Datei Upload (.Loxone)
         │
         ├── 3. Auto-Scan
         │      → erkennt alle "AICO_*__1__"-Präfixe in Bibliothek
         │      → erkennt bereits vorhandene Instanzen in Ziel-Datei
         │      → zeigt Formular: pro Baustein-Typ Zähler (0–N)
         │
         ├── 4. Vorschau
         │      → "AICO_GridProtect: fügt Instanz 2, 3 hinzu (9 Objekte je Instanz)"
         │      → Warnung bei Kollision
         │
         ├── 5. Verarbeitung + Validierung
         │      → UUID-Eindeutigkeit prüfen
         │      → XML-Wohlgeformtheit prüfen (DOMParser)
         │      → Byte-Diff gegen Original (alles außerhalb neuer Blöcke identisch)
         │
         └── 6. Download
                Kundenprojekt_erweitert_YYYY-MM-DD.Loxone
                + Validierungs-Report (.txt)
```

## Kern-Modul: `src/lib/loxone/injector.ts`

Reine TypeScript-Portierung der Python-Referenz. Keine Framework-Abhängigkeiten, damit unit-testbar.

Öffentliche API:

```ts
scanLibrary(xml: string): TemplateType[]         // findet AICO_*__1__-Blöcke
scanTarget(xml: string): Map<string, number[]>   // welche Instanzen schon da sind
planInjection(target, lib, wishes): InjectionPlan
executeInjection(target, plan): { xml, report }
validate(xml): { ok, errors }
```

Die Traversal-Logik (transitiv über `<In Input="UUID"/>` alle abhängigen Objekte einsammeln, referenzierte-aber-nicht-instanz-spezifische Objekte NICHT mitkopieren) wird 1:1 aus `loxone_duplicate_instance.py` übernommen. UUID-Generierung im Loxone-Format `xxxxxxxx-xxxx-xxxx-xxxxxxxxxxxxxxxx`.

**Wichtig:** Verarbeitung als String-Splicing, damit CRLF/BOM/Whitespace des Originals byteweise erhalten bleibt. Neue Blöcke werden direkt hinter den `__1__`-Original-Blöcken eingefügt.

## UI-Komponente

`src/components/super-admin/LoxoneInjector.tsx` — eingebunden als 4. Tab in der bestehenden Loxone-Templates-Seite.

- Datei-Upload via `<input type="file" accept=".Loxone">`
- Bibliothek wird per `supabase.storage.from("loxone-master").download(...)` geladen (neueste Version, wie im bestehenden `LoxoneMasterProject.tsx`)
- Fallback: manueller Upload einer alternativen Bibliothek
- Formular mit Nummer-Inputs pro erkanntem Baustein-Typ
- Vorschau-Card
- Prominenter Warn-Alert: „Vor Kunden-Rollout auf Test-Miniserver verifizieren."
- Download-Button erst aktiv nach erfolgreicher Validierung

## Sicherheitsregeln (hart durchgesetzt)

1. **Kein Silent-Overwrite:** bei existierender Instanz-Nummer → Fehlermeldung, kein Download.
2. **Kein Download bei fehlgeschlagener Validierung** (UUID-Kollision oder XML-Fehler).
3. **Byte-Diff-Check:** Original-Zeilen außerhalb neuer Blöcke müssen identisch sein — sonst Abbruch.
4. **Nur Super-Admin** (via `useSuperAdmin`) sieht den Tab.

## Nicht-Ziele (bewusst V1)

- Kein Upload auf Miniserver (bleibt manuell in Loxone Config)
- Keine per-Instanz-Parameterwerte im Formular (kommt evtl. in V2)
- Keine neue Automatisierungslogik — reine Vervielfältigung

## Tests

`src/lib/loxone/__tests__/injector.test.ts` mit der hochgeladenen `AICONO_Master.Loxone` als Fixture:

- Erkennt korrekt alle `AICO_*__1__`-Bausteine
- Fügt Instanz 2 hinzu, alle UUIDs neu und eindeutig
- Original-Bytes außerhalb der Ergänzung unverändert (Diff-Test)
- Ausgabe ist wohlgeformtes XML

## Offene Frage

Die hochgeladene Beispieldatei „AICONO_Master_v1.0" — soll die als **initiale Bibliothek** in den Storage-Bucket `loxone-master` gelegt werden (falls noch nicht vorhanden), damit der Injektor sofort einsatzbereit ist? Oder ist sie nur als Referenz für die XML-Struktur gedacht?  
  
Die hochgeladene Datei diente lediglich als Referenz.