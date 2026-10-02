#!/bin/bash
# AICONO Node Metrics Reporter
# Sendet alle 60 Sekunden CPU/RAM/Disk/Load/Uptime an Lovable Cloud.
#
# Installation (auf dem Hetzner-Server als root):
#   1. Datei nach /opt/aicono-node-reporter/report.sh kopieren
#   2. chmod +x /opt/aicono-node-reporter/report.sh
#   3. Datei /etc/systemd/system/aicono-node-reporter.service anlegen (siehe README.md)
#   4. systemctl daemon-reload && systemctl enable --now aicono-node-reporter

set -u

ENDPOINT="${ENDPOINT:-https://xnveugycurplszevdxtw.supabase.co/functions/v1/ingest-node-metrics}"
NODE_NAME="${NODE_NAME:-$(hostname)}"
TOKEN="${NODE_METRICS_TOKEN:-}"
INTERVAL="${INTERVAL:-60}"

if [ -z "$TOKEN" ]; then
  echo "ERROR: NODE_METRICS_TOKEN environment variable is required" >&2
  exit 1
fi

read_cpu() {
  # /proc/stat user nice system idle iowait irq softirq steal
  awk 'NR==1 {idle=$5+$6; total=$2+$3+$4+$5+$6+$7+$8+$9; print idle, total}' /proc/stat
}

while true; do
  # CPU: zwei Messungen im 1s-Abstand
  read idle1 total1 < <(read_cpu)
  sleep 1
  read idle2 total2 < <(read_cpu)
  didle=$((idle2 - idle1))
  dtotal=$((total2 - total1))
  if [ "$dtotal" -gt 0 ]; then
    cpu=$(awk -v d=$dtotal -v i=$didle 'BEGIN { printf "%.2f", (1 - i/d) * 100 }')
  else
    cpu="0"
  fi

  # Memory aus /proc/meminfo
  mem=$(awk '
    /MemTotal:/ {t=$2}
    /MemAvailable:/ {a=$2}
    END { if (t>0) printf "%.2f", (1 - a/t) * 100; else print "0" }
  ' /proc/meminfo)

  # Disk root partition
  disk=$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')

  # Load average 1min
  load=$(awk '{print $1}' /proc/loadavg)

  # Uptime
  uptime_s=$(awk '{print int($1)}' /proc/uptime)

  payload=$(cat <<EOF
{"node_name":"$NODE_NAME","cpu_percent":$cpu,"mem_percent":$mem,"disk_percent":$disk,"load_avg_1m":$load,"uptime_seconds":$uptime_s}
EOF
)

  curl -sS -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "x-node-token: $TOKEN" \
    -d "$payload" \
    --max-time 10 \
    -o /dev/null -w "[%{http_code}] $(date -Iseconds) cpu=$cpu mem=$mem disk=$disk\n" \
    || echo "[ERR] $(date -Iseconds) curl failed"

  sleep "$((INTERVAL - 1))"
done
