# AICONO Hub – Setup-Wizard (v3.2)

Ergänzt das bestehende Add-on um einen Captive-Pairing-Flow für die
neuen werkseitig vorinstallierten Hub-Images.

## Boot-Reihenfolge

1. Add-on startet (`index.ts`).
2. **Boot-Check**: `needsSetup()` prüft `/data/options.json`:
   - Sind `gateway_username` **oder** `gateway_password` leer →
     `runSetupWizard()` wird `await`ed (blockiert).
   - Sonst: regulärer Gateway-Loop startet.
3. Wizard öffnet HTTP-Server auf Port **8099**, Pfad **`/setup`**.
4. Kunde gibt 8-stelligen Code (z. B. `ABCD-1234`) aus dem AICONO Backend ein.
5. Wizard ruft `POST /functions/v1/gateway-pair` (anonym; Edge-Function
   erlaubt einmaligen Pairing-Aufruf, rotiert dabei `gateway_password`).
6. Antwort enthält `gateway_username` und `gateway_password` →
   wird in `/data/options.json` persistiert.
7. Wizard beendet sich mit `exit(0)` → HA-Supervisor startet das Add-on neu →
   regulärer Gateway-Loop läuft mit den frischen Credentials.

## mDNS / Bonjour

Der Wizard schreibt einmalig:

- `/etc/hostname` → `aicono`
- `/etc/avahi/services/aicono.service` → `_http._tcp` auf Port 8099

Damit ist das Hub im LAN als **`http://aicono.local:8099/setup`**
erreichbar – unabhängig von der DHCP-IP.

> **Wichtig**: Das HAOS-Basisimage muss `avahi-daemon` enthalten
> (siehe `aicono-os` Image-Pipeline – wird per Overlay nachinstalliert).

## Integration in `index.ts`

```ts
import { needsSetup, runSetupWizard } from "./setup-wizard";

async function main() {
  if (needsSetup()) {
    console.log("[boot] Keine Credentials – starte Setup-Wizard …");
    await runSetupWizard();
    return; // exit(0) wurde im Wizard ausgelöst
  }
  // ... bisheriger Gateway-Code (HA-Polling, WS-Client, Automation) ...
}

main().catch((e) => { console.error(e); process.exit(1); });
```

## Sync nach `CW-Aicono/ha-addons`

Diese Dateien sind die Quelle für das HA-Add-on. Nach Merge in den
Cloud-Branch müssen folgende Pfade in `CW-Aicono/ha-addons/aicono-ems-gateway/`
abgeglichen werden:

| Cloud (hier)                       | Add-on-Repo                                 |
|------------------------------------|---------------------------------------------|
| `docs/ha-addon/setup-wizard.ts`    | `setup-wizard.ts`                           |
| `docs/ha-addon/SETUP_WIZARD.md`    | `docs/SETUP_WIZARD.md`                      |
| Boot-Check-Patch in `index.ts`     | `index.ts` (oben in `main()` einfügen)      |
| `config.yaml` Bump auf v3.2.0      | `config.yaml`                               |

Sync läuft über GitHub Actions (`HA_ADDONS_PUSH_TOKEN` Secret ist
bereits konfiguriert).
