

# Plan: AICONO EMS White-Label + Offline-Fähigkeit

## Zwei Ergebnisse

1. **Code-Änderungen** an 6 Dateien (Add-on + Edge Function)
2. **Word-Dokument** (`AICONO_EMS_Anleitung.docx`) mit Schritt-für-Schritt-Anleitung zum Download

---

## Teil A: Code-Änderungen

### A1. White-Label Rebranding

| Datei | Änderungen |
|---|---|
| `docs/ha-addon/config.yaml` | name → "AICONO EMS Gateway", panel_title → "AICONO EMS", description ohne HA-Referenzen, `supabase_url` → `cloud_url` (mit Fallback) |
| `docs/ha-addon/ui/index.html` | Title → "AICONO EMS", Header-Logo als AICONO SVG, "Home Assistant"-Karte → "System", Footer mit Copyright, neue "Steuerung"-Seite |
| `docs/ha-addon/index.ts` | Startup-Banner → "AICONO EMS Gateway", device_type → "aicono-ems", `cloud_url` als primäres Config-Feld (Fallback auf `supabase_url`) |
| `docs/ha-addon/package.json` | name → "aicono-ems-gateway" |
| `docs/ha-addon/Dockerfile` | Kommentare aktualisieren |

### A2. Offline-Fähigkeit erweitern

| Datei | Änderungen |
|---|---|
| `docs/ha-addon/index.ts` | **Meter-Mappings-Cache** (neue SQLite-Tabelle `meter_mappings_cache`): beim Fetch persistieren, beim Start aus SQLite laden. **HA-States-Cache** (Tabelle `ha_states_cache`): periodisch persistieren, beim Start laden → sofort UI-fähig nach Reboot ohne Internet. |
| `docs/ha-addon/index.ts` | **`/api/execute` Endpoint**: Neuer POST-Endpoint zum lokalen Schalten von Aktoren (entity_id + service → HA REST API direkt). Funktioniert komplett offline. |
| `docs/ha-addon/ui/index.html` | **"Steuerung"-Seite**: Neue 6. Seite mit schaltbaren Kacheln (On/Off/Toggle) für switch.*, light.*, cover.* Entities. Ruft `/api/execute` auf. |
| `supabase/functions/gateway-ingest/index.ts` | `.eq("is_active", true)` entfernen → alle Automationen synchronisieren (aktive + inaktive). Lokale Engine prüft `is_active` selbst. |

### A3. Zusammenfassung der SQLite-Erweiterungen

```text
meter_mappings_cache     → Meter-Zuordnungen persistent (Offline-Polling nach Reboot)
ha_states_cache          → Letzte Sensorwerte persistent (Offline-UI nach Reboot)
/api/execute             → Lokales Schalten ohne Cloud
Steuerung-Seite          → UI für manuelles Schalten im lokalen Dashboard
sync-automations         → Auch inaktive Regeln synchronisieren
```

---

## Teil B: Word-Dokument (Anleitung)

Generierung einer DOCX-Datei mit `docx` (Node.js) unter `/mnt/documents/AICONO_EMS_Anleitung.docx`.

### Inhalt der Anleitung

1. **Was ist AICONO EMS?** – Kurze Erklärung (1 Absatz)
2. **Voraussetzungen** – Was brauchst du? (Hardware-Liste)
3. **Schritt 1: GitHub-Repository aktualisieren** – Dateien vom Lovable-Projekt nach GitHub kopieren (mit Screenshots-Beschreibung)
4. **Schritt 2: Add-on in HA aktualisieren** – Store → Nach Updates suchen → Neu aufbauen
5. **Schritt 3: Ergebnis prüfen** – Sidebar zeigt jetzt "AICONO EMS", Dashboard mit neuem Logo
6. **Schritt 4: Offline testen** – Internet trennen, Steuerung-Seite öffnen, Gerät schalten
7. **Fehlerbehebung** – Häufige Probleme + Lösungen

Jeder Schritt wird mit nummerierten Unterpunkten, fett markierten UI-Elementen und Hinweisboxen für absolute Anfänger aufbereitet.

