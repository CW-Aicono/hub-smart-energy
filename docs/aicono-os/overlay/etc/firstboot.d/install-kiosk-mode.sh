#!/bin/sh
# =====================================================================
# Phase 2 – Kiosk-Mode-Plugin beim ersten Boot herunterladen
# =====================================================================
# Laedt die offizielle kiosk-mode.js (NMRA-Hassio Community-Card) nach
# /config/www/kiosk-mode.js, sodass die in configuration.yaml unter
# frontend.extra_module_url referenzierte Datei vorhanden ist.
#
# Quelle: https://github.com/NemesisRE/kiosk-mode (MIT-Lizenz)
# Version wird per Tag gepinnt, damit Builds reproduzierbar bleiben.
# ---------------------------------------------------------------------
set -e

KIOSK_VERSION="v8.0.0"
KIOSK_URL="https://github.com/NemesisRE/kiosk-mode/releases/download/${KIOSK_VERSION}/kiosk-mode.js"
TARGET_DIR="/usr/share/hassio/homeassistant/www"
TARGET_FILE="${TARGET_DIR}/kiosk-mode.js"

mkdir -p "$TARGET_DIR"

if [ -f "$TARGET_FILE" ]; then
  echo "kiosk-mode.js bereits vorhanden – ueberspringe Download."
  exit 0
fi

echo "Lade kiosk-mode ${KIOSK_VERSION} ..."
curl -fsSL -o "$TARGET_FILE" "$KIOSK_URL" || {
  echo "WARN: Download fehlgeschlagen – Sidebar-Cleanup inaktiv."
  exit 0
}
echo "kiosk-mode.js installiert."
