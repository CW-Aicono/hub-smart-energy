

## Kurze OCPP-URL: `ocpp.aicono.org/{OCPP_ID}`

### Problem
Die aktuelle URL `wss://xnveugycurplszevdxtw.supabase.co/functions/v1/ocpp-ws-proxy/{OCPP_ID}` ist viel zu lang fuer die manuelle Eingabe auf einem Handy oder in einer Wallbox-App.

### Loesung: Zwei Massnahmen

#### 1. Infrastruktur: Reverse-Proxy-Subdomain (ausserhalb Lovable)

Da die Produktivumgebung auf eigenem Hetzner-Server laeuft, wird ein Nginx-Eintrag fuer `ocpp.aicono.org` benoetigt, der WebSocket-Verbindungen an die Supabase Edge Function weiterleitet.

```text
DNS:  ocpp.aicono.org  -->  A-Record auf Hetzner-Server IP

Nginx-Config (Beispiel):

server {
    listen 443 ssl;
    server_name ocpp.aicono.org;

    # SSL-Zertifikat (Let's Encrypt)
    ssl_certificate     /etc/letsencrypt/live/ocpp.aicono.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ocpp.aicono.org/privkey.pem;

    location / {
        proxy_pass https://xnveugycurplszevdxtw.supabase.co/functions/v1/ocpp-ws-proxy/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host xnveugycurplszevdxtw.supabase.co;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
```

Ergebnis: `wss://ocpp.aicono.org/{OCPP_ID}` -- kurz, merkbar, professionell.

#### 2. Code: OCPP-URL konfigurierbar machen

Damit die angezeigte URL in der App automatisch die kurze Domain nutzt:

- **Neue Umgebungsvariable** `VITE_OCPP_WS_URL` (optional). Wenn gesetzt, wird diese anstelle der automatisch generierten Supabase-URL verwendet.
- **Fallback**: Ist die Variable nicht gesetzt, wird weiterhin die bisherige Supabase-URL generiert.
- **Betroffene Dateien**:
  - `src/pages/OcppIntegration.tsx` -- URL-Anzeige und Copy-Funktion
  - `src/pages/ChargingPoints.tsx` -- URL-Anzeige beim Hinzufuegen eines Ladepunkts

### Technische Details

Aenderung in beiden Dateien:

```typescript
// Vorher:
const OCPP_WS_URL = `${import.meta.env.VITE_SUPABASE_URL?.replace("https://", "wss://")}/functions/v1/ocpp-ws-proxy`;

// Nachher:
const OCPP_WS_URL = import.meta.env.VITE_OCPP_WS_URL
  || `${import.meta.env.VITE_SUPABASE_URL?.replace("https://", "wss://")}/functions/v1/ocpp-ws-proxy`;
```

Fuer die Produktivumgebung unter `ems-pro.aicono.org` setzt ihr dann in der `.env`:
```
VITE_OCPP_WS_URL=wss://ocpp.aicono.org
```

### Zusammenfassung

| Schritt | Wo | Was |
|---|---|---|
| DNS-Eintrag | Domain-Registrar | `ocpp.aicono.org` A-Record |
| Nginx-Config | Hetzner-Server | WebSocket-Reverse-Proxy |
| Code-Aenderung | Lovable | `VITE_OCPP_WS_URL` Fallback in 2 Dateien |
| Env-Variable | Produktiv-Deployment | `VITE_OCPP_WS_URL=wss://ocpp.aicono.org` |

