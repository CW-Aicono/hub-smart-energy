

## Problem: Warum das Add-on nicht im Store erscheint

Ich habe die echten Dateien auf GitHub abgerufen und mit den lokalen Dateien hier verglichen. **Die Dateien auf GitHub sind veraltet/fehlerhaft** -- sie entsprechen nicht den korrigierten Versionen in diesem Projekt.

### Fehler 1: `config.yaml` hat ungueltige Schema-Syntax

**Auf GitHub steht (FALSCH):**
```yaml
schema:
  supabase_url:
    name: "Cloud URL"
    required: true
```

**Richtig waere:**
```yaml
schema:
  supabase_url: url
  gateway_api_key: str
  tenant_id: str
```

Home Assistant erwartet hinter jedem Schluessel einen **einfachen Typ** (`url`, `str`, `int`, `bool`), keine verschachtelten Bloecke mit `name:` und `required:`. Dieses falsche Format verhindert, dass HA das Add-on ueberhaupt parsen kann -- deshalb taucht es nicht im Store auf.

### Fehler 2: `config.yaml` fehlen API-Berechtigungen

Auf GitHub fehlen die Zeilen `hassio_api: true` und `homeassistant_api: true`. Ohne diese kann das Add-on nicht mit Home Assistant kommunizieren.

### Fehler 3: `Dockerfile` fehlt Build-Toolchain

Auf GitHub fehlt die Zeile `RUN apk add --no-cache python3 make g++`. Ohne diese Pakete kann `better-sqlite3` auf ARM-Architekturen (Raspberry Pi) nicht kompiliert werden -- die Installation wuerde spaeter beim Build fehlschlagen.

---

## Plan

### Schritt 1: Alle drei fehlerhaften Dateien auf GitHub ersetzen

Die INSTALLATION.md wird um einen neuen Abschnitt **"5.0 GitHub-Dateien aktualisieren"** erweitert, der Schritt fuer Schritt erklaert, wie man auf GitHub eine bestehende Datei ersetzt:

1. Datei auf GitHub oeffnen
2. Stift-Symbol klicken (Edit)
3. Gesamten Inhalt markieren und loeschen
4. Neuen (korrekten) Inhalt reinkopieren
5. "Commit changes" klicken

Dies wird fuer alle drei Dateien einzeln beschrieben:
- `ems-gateway-hub/config.yaml` (kompletter korrekter Inhalt wird abgedruckt)
- `ems-gateway-hub/Dockerfile` (kompletter korrekter Inhalt wird abgedruckt)

### Schritt 2: config.yaml im Lovable-Projekt anpassen

Die lokale `docs/ha-addon/config.yaml` hat bereits die korrekte Schema-Syntax (`url`, `str`, `int`), aber verwendet `str(1,)` und `int(1,)` -- auch diese erweiterte Syntax ist **nicht gueltig** in Home Assistant. Die Datei wird auf die einfachen Typen `str`, `int`, `url` umgestellt.

### Schritt 3: INSTALLATION.md komplett ueberarbeiten (Abschnitt 5)

Abschnitt 5 wird neu geschrieben mit:
- Klarer Nummerierung ohne Unterpunkte
- Direktem Link zum Add-on Store (`http://homeassistant.local:8123/hassio/store`)
- Erklaerung was nach dem Hinzufuegen des Repos passieren muss (Seite neu laden / kurz warten)
- Hinweis: Nach Repository-Aenderungen auf GitHub muss in HA der Store **neu geladen** werden (drei Punkte → "Check for updates" oder Seite neu laden)

### Betroffene Dateien

| Datei | Aenderung |
|---|---|
| `docs/ha-addon/config.yaml` | Schema-Typen von `str(1,)` auf `str` aendern |
| `docs/ha-addon/INSTALLATION.md` | Abschnitt 5 komplett neu schreiben mit GitHub-Update-Anleitung und Store-Reload-Hinweis |

