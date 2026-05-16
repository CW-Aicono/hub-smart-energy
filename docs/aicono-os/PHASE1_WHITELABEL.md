# Phase 1 – AICONO White-Label (Home Assistant unsichtbar)

Diese Phase macht aus dem HAOS-Image eine reine AICONO-Oberflaeche.
Home Assistant laeuft weiter im Hintergrund, ist aber fuer den Endnutzer
nicht mehr sichtbar.

## Was Phase 1 macht

1. **Default-Panel = AICONO EMS Gateway**
   Nach dem Login landet der Nutzer direkt im AICONO-Add-on (Ingress).
   Konfiguriert in `homeassistant/configuration.yaml` ueber
   `frontend.default_panel: aicono-ems-gateway`.

2. **AICONO-Theme statt HA-Blau**
   `homeassistant/themes/aicono.yaml` definiert die AICONO-Markenfarben
   (Navy `#0A1F44`, Teal `#14B8A6`) fuer Sidebar, Header, Buttons,
   Login-Screen und Toggles – sowohl Light- als auch Dark-Variante.

3. **Eigenes Logo**
   `homeassistant/www/aicono-logo.svg` als Platzhalter. Wird ueber das
   Theme bzw. spaeter in Phase 3 auch im Login-Screen referenziert.

4. **HTTP/Ingress vorbereitet**
   `use_x_forwarded_for` + `trusted_proxies` sind gesetzt, damit die
   AICONO-UI sauber per Ingress eingebettet wird.

## Dateien

```
overlay/usr/share/hassio/homeassistant/
├── configuration.yaml      ← default_panel + Theme-Loader
├── automations.yaml        ← leer (Pflicht-Includes)
├── scripts.yaml            ← leer
├── scenes.yaml             ← leer
├── themes/
│   └── aicono.yaml         ← AICONO Light + Dark Theme
└── www/
    └── aicono-logo.svg     ← Platzhalter-Logo
```

## Was der Endnutzer sieht

| Bereich              | Vorher (HA)          | Nachher (AICONO Phase 1)        |
| -------------------- | -------------------- | ------------------------------- |
| Start nach Login     | HA Lovelace          | AICONO EMS Panel                |
| Sidebar-Farbe        | HA-Blau              | AICONO Navy                     |
| Akzentfarbe          | HA-Blau              | AICONO Teal                     |
| Login-Screen-Farbe   | HA-Blau              | AICONO Navy                     |
| Standard-Panel-Titel | Home Assistant       | AICONO EMS (aus Add-on config)  |

## Was Phase 1 NICHT macht

- Sidebar-Eintraege wie "Entwicklerwerkzeuge", "Einstellungen",
  "Geraete & Dienste" sind weiterhin sichtbar.
  → wird in **Phase 2** ueber `kiosk-mode`/`hide_panel` ausgeblendet.
- Boot-Splash zeigt noch das HA-Logo.
  → **Phase 3** ersetzt Splash + Login-Logo + About-Seite.
- Power-User per SSH sehen weiterhin "Home Assistant" Eintraege.
  → bleibt so (Open-Source-Lizenz-Hinweise muessen erhalten bleiben).

## Aktivierung

Die Dateien werden beim naechsten Image-Build automatisch in das
hassos-data-Overlay injiziert (`scripts/inject-addon.sh`).
Bei bestehenden Installationen reicht ein Update auf das neue Image
oder das manuelle Kopieren der Dateien nach
`/usr/share/hassio/homeassistant/` mit anschliessendem HA-Neustart.
