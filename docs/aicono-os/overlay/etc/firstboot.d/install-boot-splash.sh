#!/bin/sh
# =====================================================================
# Phase 3 – Boot-Splash auf AICONO-Logo umstellen
# =====================================================================
# HAOS nutzt Plymouth. Wir ersetzen das Standard-Theme-Logo durch
# unser AICONO-Logo. Falls das Plymouth-Theme-Verzeichnis nicht
# existiert (z.B. headless variant), wird der Schritt übersprungen.
# ---------------------------------------------------------------------
set -e

LOGO_SRC="/usr/share/hassio/homeassistant/www/aicono-boot-splash.png"
PLYMOUTH_THEME_DIR="/usr/share/plymouth/themes/haos"

if [ ! -f "$LOGO_SRC" ]; then
  echo "Boot-Splash-Logo fehlt – ueberspringe."
  exit 0
fi

if [ ! -d "$PLYMOUTH_THEME_DIR" ]; then
  echo "Plymouth-Theme-Verzeichnis nicht gefunden – ueberspringe."
  exit 0
fi

cp -f "$LOGO_SRC" "$PLYMOUTH_THEME_DIR/logo.png" || {
  echo "WARN: Boot-Splash konnte nicht ersetzt werden."
  exit 0
}

# Falls plymouth-set-default-theme verfuegbar ist, sicherstellen,
# dass das Theme aktiv ist.
if command -v plymouth-set-default-theme >/dev/null 2>&1; then
  plymouth-set-default-theme -R haos 2>/dev/null || true
fi

echo "AICONO Boot-Splash installiert."
