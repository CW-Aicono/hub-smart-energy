#!/usr/bin/env bash
# Bootet das gebaute Image kurz in QEMU und prüft, dass der Pairing-Wizard
# auf Port 8099 antwortet. Wird im CI optional ausgeführt (Phase 2).
set -euo pipefail

IMG="${1:?image path required}"
PORT="${PORT:-18099}"

if ! command -v qemu-system-x86_64 >/dev/null; then
  echo "qemu-system-x86_64 nicht installiert – verifiziere lediglich Datei."
  test -s "$IMG"
  exit 0
fi

echo "→ Starte QEMU-Boot für $IMG (Port $PORT) …"
qemu-system-x86_64 -m 2048 -smp 2 -nographic -drive "file=$IMG,format=raw" \
  -netdev user,id=n0,hostfwd=tcp::${PORT}-:8099 -device virtio-net,netdev=n0 &
QPID=$!
trap 'kill $QPID 2>/dev/null || true' EXIT

for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${PORT}/setup" >/dev/null; then
    echo "✔ Setup-Wizard erreichbar."
    exit 0
  fi
  sleep 5
done
echo "✗ Setup-Wizard nach 5 Minuten nicht erreichbar."
exit 1
