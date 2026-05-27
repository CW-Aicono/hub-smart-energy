# AICONO Node Metrics Reporter

Sendet alle 60 Sekunden CPU/RAM/Disk/Load/Uptime von einem Hetzner-Server an die Lovable Cloud. Anzeige im Super-Admin → Monitoring.

## Installation (Schritt-für-Schritt, als root auf dem Hetzner-Server)

### 1. Token aus Lovable holen
Den Wert des Secrets `NODE_METRICS_TOKEN` (in Lovable Cloud → Secrets) bereithalten.

### 2. Skript kopieren
```bash
mkdir -p /opt/aicono-node-reporter
nano /opt/aicono-node-reporter/report.sh
```
Inhalt von `report.sh` aus diesem Ordner einfügen, speichern (Strg+O, Enter, Strg+X).

```bash
chmod +x /opt/aicono-node-reporter/report.sh
```

### 3. systemd-Service anlegen
```bash
nano /etc/systemd/system/aicono-node-reporter.service
```

Folgenden Inhalt **komplett** einfügen und `DEIN_TOKEN_HIER` durch den echten Token ersetzen, `NODE_NAME` ggf. anpassen:

```ini
[Unit]
Description=AICONO Node Metrics Reporter
After=network-online.target

[Service]
Type=simple
Environment="NODE_METRICS_TOKEN=DEIN_TOKEN_HIER"
Environment="NODE_NAME=hetzner-prod-1"
Environment="INTERVAL=60"
ExecStart=/opt/aicono-node-reporter/report.sh
Restart=always
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
```

### 4. Service starten
```bash
systemctl daemon-reload
systemctl enable --now aicono-node-reporter
systemctl status aicono-node-reporter
```

Erwartete Ausgabe: `active (running)`, Logs zeigen `[200] ...`.

### 5. Live-Logs prüfen
```bash
journalctl -u aicono-node-reporter -f
```

## Deinstallation
```bash
systemctl disable --now aicono-node-reporter
rm /etc/systemd/system/aicono-node-reporter.service
rm -rf /opt/aicono-node-reporter
systemctl daemon-reload
```
