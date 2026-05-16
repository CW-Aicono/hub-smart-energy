# Phase 3 – Boot-Splash, Login-Logo, About-Seite

Phase 3 schliesst das White-Label visuell ab: Boot, Login und die
"Ueber"-Seite tragen AICONO-Branding mit den Pflicht-Lizenzhinweisen
fuer die genutzten Open-Source-Komponenten.

## Was Phase 3 macht

1. **Login-Banner (AICONO-Logo)**
   `homeassistant/www/aicono-login-banner.svg` wird ueber das
   AICONO-Theme im Login-Screen angezeigt (Navy/Teal Gradient,
   "AICONO – SMART ENERGY HUB").

2. **Boot-Splash**
   `overlay/etc/firstboot.d/install-boot-splash.sh` ersetzt beim
   ersten Boot das HAOS-Plymouth-Logo durch
   `aicono-boot-splash.png`. Falls die Datei oder das Plymouth-Theme
   nicht vorhanden ist, wird der Schritt sauber uebersprungen
   (HA bootet weiter).
   Das PNG muss spaeter (1920x1080) als finales Asset eingespielt
   werden – Platzhalter-Hinweis liegt unter
   `www/aicono-boot-splash.png.README`.

3. **About-Seite mit Lizenzhinweisen**
   `homeassistant/www/aicono-about.html` ist eine statische Seite,
   die ueber `/local/aicono-about.html` erreichbar ist. Sie enthaelt:
   - Produkt- und Hersteller-Infos
   - Open-Source-Lizenzhinweise (HAOS/HA Core Apache 2.0, Linux
     Kernel GPLv2, BusyBox/Alpine/systemd, kiosk-mode MIT)
   - Verweis auf `/usr/share/licenses/` fuer vollstaendige Texte
   - Power-User-URLs zu HA-Bereichen
   Wird im AICONO-Add-on im Footer als "Ueber / Lizenzen" verlinkt.

## Dateien

```
overlay/etc/firstboot.d/
└── install-boot-splash.sh

overlay/usr/share/hassio/homeassistant/www/
├── aicono-login-banner.svg
├── aicono-about.html
└── aicono-boot-splash.png.README
```

## Was der Endnutzer sieht

| Bereich           | Vorher (HA)        | Nachher (AICONO Phase 3)      |
| ----------------- | ------------------ | ----------------------------- |
| Boot-Splash       | HA-Logo            | AICONO-Logo (sofern PNG dabei) |
| Login-Screen-Logo | HA-Logo            | AICONO-Banner                  |
| About / Impressum | HA-Versionsinfo    | AICONO + Open-Source-Hinweise  |

## Pflicht-Hinweis

Die Open-Source-Lizenzen **muessen sichtbar** bleiben:
- Apache 2.0 (HA Core/HAOS)
- GPLv2 (Kernel, BusyBox)
- MIT (kiosk-mode)

Die About-Seite erfuellt diese Pflicht im UI; die vollstaendigen
Lizenztexte verbleiben unter `/usr/share/licenses/` auf dem Geraet.

## Naechste Schritte (optional)

- Finales `aicono-boot-splash.png` (1920x1080) einspielen.
- Link zur About-Seite im AICONO-Add-on-Footer ergaenzen
  (`<a href="/local/aicono-about.html">Ueber &amp; Lizenzen</a>`).
- Phase 4 (optional): SSH-MOTD/issue.net auf AICONO umbiegen.
