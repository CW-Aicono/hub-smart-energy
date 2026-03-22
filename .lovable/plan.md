

# Firmware-Update-Check & -Trigger für Loxone Gateways

## Analyse der Loxone API

Die offizielle Loxone Web Services Dokumentation bietet folgende relevante Endpunkte:

```text
Lesen:
  jdev/cfg/version          → aktuelle Firmware-Version
  jdev/cfg/versiondate      → Firmware-Erstellungsdatum
  data/status               → XML mit allen Geräten + Versionen (Extensions, Tree, Air)

Update auslösen:
  jdev/sys/updatetolatestrelease     → Miniserver auf neueste Firmware aktualisieren
  jdev/sys/wsextension/<serial>/ForceUpdate/0C000001/DeviceIndex  → Extension-Update
  jdev/sys/wsdevice/<serial>/ForceUpdate/0C000001/DeviceIndex     → Tree/Air-Geräte-Update
```

### Wichtige Einschränkung

Die Loxone API bietet **keinen Endpunkt**, um die neueste verfügbare Version abzufragen. Man kann nur die aktuelle Version lesen und blind ein Update triggern. Das Update lädt dann automatisch die neueste Release-Version von den Loxone-Servern.

## Umsetzungsplan

### 1) Edge Function erweitern (`loxone-api/index.ts`)

Zwei neue Actions hinzufügen:

- **`getVersion`**: Ruft `jdev/cfg/version` und `jdev/cfg/versiondate` ab, optional `data/status` für Extension-Versionen. Gibt strukturiertes JSON zurück mit Miniserver-Version, Datum und Liste der Extensions mit deren Versionen.

- **`triggerUpdate`**: Ruft `jdev/sys/updatetolatestrelease` auf. Erfordert Full-Access-User. Gibt Erfolg/Fehler zurück. Vor dem Aufruf wird eine Bestätigungsprüfung erzwungen (Parameter `confirmed: true` im Request).

### 2) UI auf der Integrationen-Seite (`IntegrationCard.tsx`)

Pro Loxone-Gateway-Karte:
- Neuer Button **"Firmware prüfen"** (neben "Verbindung testen")
- Beim Klick: Version + Datum abrufen und anzeigen (z.B. „Version 14.5.12.4 vom 15.01.2026")
- Falls Extensions vorhanden: deren Versionen in einer kleinen Liste darunter
- Button **"Update starten"** mit Bestätigungs-Dialog (AlertDialog): „Das Miniserver-Update wird gestartet. Der Miniserver ist während des Updates nicht erreichbar. Fortfahren?"
- Nach Trigger: Hinweis „Update wurde gestartet. Der Miniserver startet automatisch neu."

### 3) Nur für Loxone-Typ

Die Firmware-Update-Funktionalität wird nur für `loxone_miniserver`-Integrationen angeboten, da die anderen Gateway-Typen (Shelly, ABB, Siemens, etc.) keine vergleichbaren Update-Endpunkte über ihre Cloud-APIs bereitstellen.

## Betroffene Dateien

- `supabase/functions/loxone-api/index.ts` – neue Actions `getVersion` und `triggerUpdate`
- `src/components/integrations/IntegrationCard.tsx` – Firmware-Buttons und Versionsanzeige
- Ggf. `src/i18n/translations.ts` – neue Übersetzungsschlüssel

## Technische Details

```text
IntegrationCard (Loxone)
  [Firmware prüfen] → invoke("loxone-api", { action: "getVersion" })
                     → zeigt Version + Datum + Extension-Liste
  [Update starten]  → AlertDialog Bestätigung
                     → invoke("loxone-api", { action: "triggerUpdate", confirmed: true })
                     → Erfolgsmeldung / Fehlermeldung via Toast
```

User mit `Trigger Update`-Recht auf dem Miniserver ist Voraussetzung (Loxone-Berechtigung `0x00008000`). Fehlt das Recht, gibt der Miniserver HTTP 401/403 zurück – wird als klare Fehlermeldung angezeigt.

