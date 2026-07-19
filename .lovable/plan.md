# Plan: 28 AICO_-Interface-Stubs im Master-Projekt ergänzen

## Ziel
Für alle 28 noch fehlenden AICO_-Bausteine aus `src/lib/loxone/snippetsCatalog.ts` einmalig Virtual Inputs/Outputs mit korrekter Namenskonvention `AICO_<Type>__1__<Param>` in die Master-`.Loxone`-Datei einspleißen. Nach diesem Schritt funktioniert **Discovery** (🧩) und **Injektor** (Vervielfachung) für alle 29 Bausteine end-to-end.

**Wichtig — Grenze:** Diese Stubs enthalten nur das Interface (Werte-Austausch AICONO ↔ Miniserver). Die eigentliche Loxone-Programmlogik pro Baustein (Verdrahtung, Formeln, Timer) muss danach separat in Loxone Config einmal pro Typ ergänzt und die Datei erneut ins Master-Projekt geladen werden. Das ist ausdrücklich als späterer Schritt vorgesehen.

## Umsetzung

### 1. Generator-Skript (neu)
`src/lib/loxone/masterStubGenerator.ts`
- Liest alle Typen aus `snippetsCatalog.ts` (die 29 AICO_-Bausteine inkl. Parameter, Datentyp Digital/Analog, Richtung Input/Output).
- Erzeugt pro Typ Instanz `__1__` als Referenz-Block (dasselbe Muster wie das existierende `AICO_GridProtect`).
- Nutzt bereits vorhandene UUID-Utilities aus `src/lib/loxone/injector.ts` (Loxone-konforme UUIDs, keine Duplikate).
- Vergibt eigene Kategorie „AICONO" und Raum „AICONO_System", falls noch nicht vorhanden.

### 2. Neuer Sub-Aktion im Injektor-Tab
`src/components/super-admin/LoxoneInjector.tsx`
- Zusätzlicher Button **„Fehlende AICO_-Bausteine ergänzen (Stubs)"** oben.
- Workflow:
  1. Neueste Master-Datei aus Bucket `loxone-master` laden.
  2. `scanTarget()` liefert bereits vorhandene Typen (aktuell: nur `GridProtect`).
  3. Delta zu `snippetsCatalog` bilden → 28 fehlende Typen.
  4. Für jeden fehlenden Typ Stub `__1__` einfügen (bestehendes `executeInjection`-Muster wiederverwenden, aber mit synthetischem Referenz-Block statt Kopie).
  5. `validate()` + `verifyOriginalPreserved()` (nur Ergänzungen, keine Änderungen an Bestandsblöcken).
  6. Ergebnis: Download `AICONO_Master_v1.x_stubs.Loxone` **und** direkter Upload in Bucket `loxone-master` als neue Version.

### 3. Validierung
- UUID-Uniqueness über gesamte Datei.
- XML-Wohlgeformtheit.
- Byte-Diff: Nur Additionen, keine Modifikationen bestehender Bytes.
- Report-Datei mit Liste aller 28 hinzugefügten Bausteine + Parameter.

### 4. Katalog-Konsistenz-Prüfung (parallel)
Vor Generierung einmal alle 29 Katalog-Einträge in `snippetsCatalog.ts` gegen die dokumentierten Parameter (aus dem Konzept-PDF) abgleichen. Falls Abweichungen: Katalog vorher korrigieren, dann Stubs bauen — damit der Bauplan der Referenz entspricht.

## Ergebnis für dich
1. Ein Klick im Super-Admin → Loxone-Templates → Injektor → „Stubs ergänzen".
2. Neue Master-Datei mit allen 29 Bausteinen (je 1 Referenz-Instanz) liegt im Bucket.
3. Discovery (🧩) findet ab sofort alle 29 Typen auf einem Miniserver, sobald diese Master-Datei aufgespielt wurde.
4. Injektor kann jeden Typ auf N Instanzen vervielfachen.
5. **Danach separat**: Loxone-Partner ergänzt die echte Programmlogik pro Typ und lädt die finale Datei wieder in den Master-Tab.

## Nicht Teil dieses Plans
- Erzeugung echter Loxone-Programmbausteine/Verdrahtung (technisch aus Lovable nicht möglich).
- Änderungen am Discovery-Parser oder Rule Builder (funktioniert bereits, siehe GridProtect-Test).
