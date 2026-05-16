# Phase 2 – Sidebar-Cleanup (HA unsichtbar machen)

Phase 2 versteckt alle Standard-Home-Assistant-Eintraege aus der Sidebar,
damit der Endnutzer ausschliesslich die AICONO-Oberflaeche sieht.

## Wichtig: Routen bleiben erreichbar

Es werden **nur die Sidebar-Eintraege ausgeblendet**, nicht die Routen
selbst. Fuer Einrichtung und Bugfixing kann jede HA-Seite weiterhin
direkt per URL geoeffnet werden:

| Bereich              | URL (Beispiel)                            |
| -------------------- | ----------------------------------------- |
| Einstellungen        | `https://<hub>/config/dashboard`          |
| Geraete & Dienste    | `https://<hub>/config/integrations`       |
| Add-ons              | `https://<hub>/hassio/dashboard`          |
| Entwicklerwerkzeuge  | `https://<hub>/developer-tools/state`     |
| Verlauf              | `https://<hub>/history`                   |
| Logbuch              | `https://<hub>/logbook`                   |
| Energie (HA)         | `https://<hub>/energy`                    |
| Standard-Dashboard   | `https://<hub>/lovelace`                  |

## Wie es funktioniert

1. **`kiosk-mode.js`** (Community-Plugin, MIT, gepinnt auf `v8.0.0`)
   wird beim ersten Boot per `etc/firstboot.d/install-kiosk-mode.sh`
   nach `/config/www/kiosk-mode.js` heruntergeladen.
2. `configuration.yaml` referenziert es ueber
   `frontend.extra_module_url: ['/local/kiosk-mode.js']`.
3. Der `kiosk_mode:`-Block listet die zu versteckenden Panel-Slugs.

## Ausgeblendete Sidebar-Eintraege

- Uebersicht (lovelace)
- Energie
- Karte
- Logbuch
- Verlauf
- Medien
- Aufgaben / Kalender / Einkaufsliste
- Add-ons (hassio)
- Entwicklerwerkzeuge (developer-tools)
- Einstellungen (config)

Sichtbar bleiben: **AICONO EMS** (Default-Panel) sowie evtl. weitere
explizit als Panel registrierte AICONO-Komponenten.

## Aktivierung

Beim naechsten Image-Build automatisch. Bei bestehenden Installationen:

```bash
# 1. Plugin manuell ablegen
mkdir -p /config/www
curl -fsSL -o /config/www/kiosk-mode.js \
  https://github.com/NemesisRE/kiosk-mode/releases/download/v8.0.0/kiosk-mode.js

# 2. configuration.yaml aus diesem Overlay uebernehmen
# 3. Home Assistant neu starten (Einstellungen -> System -> Neu starten)
# 4. Browser-Cache leeren (Strg+Shift+R)
```

## Rueckgaengig machen

In `configuration.yaml` den kompletten `kiosk_mode:`-Block sowie die
Zeile `extra_module_url:` entfernen und HA neu starten.
