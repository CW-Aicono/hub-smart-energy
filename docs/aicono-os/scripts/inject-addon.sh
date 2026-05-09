#!/usr/bin/env bash
# Mountet ein HAOS-Image (root + overlay-Partition) und kopiert
# unser Overlay (Add-on, Avahi-Service, Hostname) hinein.
#
#   sudo ./inject-addon.sh build/base.img overlay/
set -euo pipefail

IMG="${1:?image path required}"
OVERLAY="${2:?overlay dir required}"

if [[ ! -f "$IMG" ]]; then echo "Image $IMG not found"; exit 1; fi
if [[ ! -d "$OVERLAY" ]]; then echo "Overlay $OVERLAY not found"; exit 1; fi

LOOP="$(losetup --show -fP "$IMG")"
trap 'sync; losetup -d "$LOOP" || true' EXIT

# HAOS hat üblicherweise Partition 8 = "hassos-data" (overlay/r-w)
# und Partition 1 = boot (efi). Wir schreiben in hassos-data.
DATA_PART="${LOOP}p8"
if [[ ! -b "$DATA_PART" ]]; then
  echo "Erwartete Daten-Partition ${DATA_PART} nicht gefunden – Layout geändert?"
  lsblk "$LOOP"
  exit 2
fi

MNT="$(mktemp -d)"
mount "$DATA_PART" "$MNT"
trap 'umount "$MNT" || true; rmdir "$MNT" || true; sync; losetup -d "$LOOP" || true' EXIT

echo "→ kopiere Overlay-Dateien …"
cp -av "$OVERLAY"/. "$MNT"/

# avahi-daemon nachziehen, falls im Basisimage nicht enthalten
if [[ -d "$MNT/etc/apt" ]]; then
  echo "→ markiere avahi-daemon zur Installation beim ersten Boot"
  mkdir -p "$MNT/etc/firstboot.d"
  cat > "$MNT/etc/firstboot.d/install-avahi.sh" <<'EOF'
#!/bin/sh
apk add --no-cache avahi avahi-tools dbus 2>/dev/null || \
apt-get update && apt-get install -y --no-install-recommends avahi-daemon
rc-service dbus start 2>/dev/null || systemctl enable --now dbus 2>/dev/null || true
rc-service avahi-daemon start 2>/dev/null || systemctl enable --now avahi-daemon 2>/dev/null || true
EOF
  chmod +x "$MNT/etc/firstboot.d/install-avahi.sh"
fi

echo "→ fertig. Inhalt:"
ls -la "$MNT"/usr/share/hassio/addons/local/ 2>/dev/null || true
