# AICONO MQTT Cloud Bridge

Schlanker Reverse-Bridge-Service: abonniert den AICONO Cloud-Mosquitto-Broker
und leitet jede Meldung an die `gateway-ingest` Edge Function weiter.

## Komponenten

| Container | Zweck |
|-----------|-------|
| `mosquitto` | TLS-MQTT-Broker (Port 8883). Klartext-Port 1883 ist deaktiviert. |
| `bridge` | Node.js-Service, der `aicono/#` abonniert und an Supabase POSTet. |

## Setup auf VPS (einmalig)

1. **Domain & TLS-Zertifikat**: A-Record `mqtt.aicono.org` → VPS-IP, dann `certbot certonly --standalone -d mqtt.aicono.org`.
2. **Mosquitto-Passwortdatei** anlegen: `mosquitto_passwd -c ./mosquitto/passwd bridge`.
3. **ACL-Datei** `./mosquitto/acl`:
   ```
   user bridge
   topic readwrite aicono/#
   ```
4. **Pro Mandant** wird Benutzer + ACL durch die Edge Function `mqtt-credentials` automatisch ergänzt.
5. **`.env`** anlegen mit `MQTT_ADMIN_PASSWORD`, `GATEWAY_API_KEY`, `ROUTES_JSON`.
6. `docker compose up -d`.

## Endkundenanleitung

Siehe Word-Dokument `/mnt/documents/AICONO_MQTT_Integration.docx`.
