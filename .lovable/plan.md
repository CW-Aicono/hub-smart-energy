# AICONO Gateway – Industrie-Hardware-Strategie

## Ausgangslage

Heute existiert nur **ein Weg**: Kunde flasht selbst HAOS auf einen Raspberry Pi und installiert das `aicono-ems-gateway` Add-on aus unserem Repo. Für B2B-Industrie-Kunden ist das zu fummelig (SD-Karte, Imager, HA-Account-Setup, Add-on-Repo eintragen, Username/Passwort manuell eintippen).

Mit deinen Antworten ergibt sich folgender Zielzustand:

- **Mehrere Hardware-Varianten parallel** (x86 Mini-PC, DIN-Hutschienen-IPC, optional HA Yellow/Green)
- **Hybrid-Provisionierung**: ein generisches Image + One-Time-Pairing-Token aus dem AICONO-Cockpit
- **Verteilung über GitHub Releases** (privates Repo `CW-Aicono/ha-addons` oder neues `CW-Aicono/aicono-os`)

---

## Zielarchitektur

```text
┌─────────────────────┐   1. Super-Admin erzeugt Pairing-Token (8-stellig)
│  AICONO Cloud       │      → gespeichert in gateway_pairing_tokens (TTL 7d)
│  (Lovable/Supabase) │   2. Kunde startet Hardware → Captive-Wizard
└──────────┬──────────┘   3. Token + WLAN/LAN eintragen → fertig
           │
           │ WebSocket (gateway-ws)
           │
┌──────────▼──────────┐
│  AICONO Gateway OS  │   = HAOS-Generic (x86_64) ODER HAOS-aarch64
│  + Pre-Bundled      │     mit vorinstalliertem aicono-ems-gateway Add-on
│  Add-on (Auto-Run)  │     + Pairing-Wizard (statt Username/Passwort)
└─────────────────────┘
```

Damit bleibt unser Stack identisch (HA-Add-on, WebSocket, gateway-ingest) – wir verändern nur den **Auslieferungs-/Onboarding-Layer**.

---

## Hardware-Matrix (Vorschlag für AICONO-Shop)


| Variante                  | Hardware                                                     | Image                                       | Zielgruppe                           | Listenpreis brutto |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------- | ------------------------------------ | ------------------ |
| **AICONO Hub Mini**       | Intel N100 Mini-PC (z.B. Beelink S12, GMKtec G3)             | `haos_generic-x86-64`                       | Büro, Wohnung, kleine Liegenschaft   | 250–350 €          |
| **AICONO Hub Industrial** | Onlogic K-100 / Revolution Pi Connect 4 (DIN-Schiene, RS485) | `haos_generic-x86-64` bzw. `haos_rpi5-64`   | Schaltschrank, Heizungsraum, Gewerbe | 800–1.500 €        |
| **AICONO Hub Home**       | HA Green (rebranded Sticker)                                 | werksseitig HAOS, AICONO-Add-on per Pairing | Endkunden / Kleinanlagen             | 99 €               |


> **Wichtig:** Wir bauen **kein eigenes OS-Image**. Wir nutzen das offizielle HAOS-Image und überlagern es mit einer **AICONO-Konfigurations-Schicht** (Add-on + Auto-Provisioning-Skript). Das spart uns Wartung von Kerneln, Sicherheitsupdates und Hardware-Treibern – HA-Foundation übernimmt das.

---

## Image-Erzeugung & -Verteilung

### Was im Image enthalten ist

```text
HAOS-Base (offiziell, unverändert)
   │
   ├── /addons/aicono-ems-gateway/    ← unser Add-on, vorinstalliert
   ├── /config/configuration.yaml     ← Default-HA-Setup ohne Onboarding-Wizard
   ├── /config/.aicono/pairing.html   ← Captive Page (Schritt-1-Pairing)
   └── /config/automations.yaml       ← Auto-Start des Add-ons beim Boot
```

### Build-Pipeline (GitHub Actions im Repo `CW-Aicono/aicono-os`)

1. **Trigger**: Tag-Push (`v3.2.0`) oder manueller `workflow_dispatch`
2. **Schritte**:
  - HAOS-Base-Image herunterladen (`haos_generic-x86-64-XX.X.img.xz`)
  - Image mit `losetup` + `mount` einhängen
  - Add-on-Tarball entpacken nach `/addons/aicono-ems-gateway/`
  - AICONO-Defaults nach `/config/` kopieren
  - Image neu komprimieren (`xz -9`)
  - SHA256-Checksum erzeugen
3. **Artefakte hochladen**: GitHub Release mit
  - `aicono-os_v3.2.0_x86-64.img.xz` (~600 MB)
  - `aicono-os_v3.2.0_aarch64.img.xz` (~500 MB)
  - `SHA256SUMS.txt`
  - `release-notes.md`

GitHub-Releases-Limit ist 2 GB pro Datei → reicht problemlos. Privater Repo bleibt möglich, Download-URL mit GitHub-PAT signiert (Edge Function `gateway-image-download` gibt zeitlich begrenzte Redirect-URL zurück).

### Verteilung an den Kunden

- **Variante A (Self-Service):** Cockpit → "Neues Gateway" → Button "Image herunterladen" → signierte URL → Kunde flasht mit Raspberry Pi Imager / balenaEtcher
- **Variante B (Pre-Flashed Hardware):** AICONO bestellt Mini-PCs in Charge, flasht per `dd` aus Skript, packt Pairing-Token-Aufkleber ins Gehäuse, versendet plug-and-play

---

## Pairing-Workflow (One-Time-Token)

### Cloud-Seite (neu)

- **Tabelle** `gateway_pairing_tokens`
  - `token` (8-stellig, alphanum, z.B. `K7-X9P-22`)
  - `tenant_id`, `location_id`
  - `created_by`, `expires_at` (Default 7 Tage)
  - `used_at`, `bound_to_mac`
- **Edge Function** `gateway-pair`:
  - `POST /pair` mit `{token, mac_address, hostname}` → erzeugt Eintrag in `gateway_devices`, gibt `gateway_username` + `gateway_password` zurück, markiert Token als verbraucht
- **UI** im Cockpit (`/integrations/gateways/new`):
  - Wizard: "Standort wählen → Token generieren → QR-Code anzeigen"
  - Token-Liste mit Status (offen / gebunden / abgelaufen)

### Gateway-Seite (Add-on-Erweiterung)

- Beim ersten Boot prüft das Add-on, ob `gateway_username` leer ist
- Wenn leer: startet **Captive-Web-Wizard** auf `http://<lan-ip>:8099/setup`
  - Schritt 1: Pairing-Token eintragen (oder QR-Code scannen)
  - Schritt 2: Add-on ruft `gateway-pair` mit MAC-Adresse auf
  - Schritt 3: Credentials werden in `/data/options.json` persistiert, Add-on neugestartet
- Anschließend läuft alles wie heute (WebSocket-Verbindung, Heartbeat)

### Kundenerlebnis

```text
Karton aus → Stromkabel + LAN-Kabel anschließen → 3 Min warten
→ http://aicono.local öffnen → Token eingeben → fertig
```

Keine HA-Account-Erstellung, kein Add-on-Repo eintippen, keine YAML.

---

## Sicherheit

- Pairing-Token nur **einmal verwendbar**, Gültigkeit: Token verfällt nach Pairing
- Token bindet sich beim ersten Heartbeat an die **MAC-Adresse** – spätere Verbindungsversuche mit anderer MAC werden abgelehnt
- Image-Downloads über zeitlich begrenzte signierte URLs (15 Min)
- HAOS-Updates kommen weiter direkt von Home Assistant, AICONO-Add-on-Updates via unser bestehendes HA-Repo

---

## Umsetzung in Phasen

### Phase 1 – Pairing-Backend (1 Tag)

- Migration `gateway_pairing_tokens` + RLS
- Edge Function `gateway-pair` (Token validieren, Device anlegen, Credentials zurückgeben)
- Cockpit-UI: Token-Generator + Liste unter `/integrations/gateways`

### Phase 2 – Add-on-Pairing-Wizard (1 Tag)

- Captive-Page `/setup` im bestehenden Add-on-UI ergänzen
- `index.ts`: Boot-Check auf leere Credentials → Wizard-Modus
- Optional: Bonjour/mDNS-Hostname `aicono.local`

### Phase 3 – Image-Build-Pipeline (2 Tage)

- Neues Repo `CW-Aicono/aicono-os` (oder Workflow im bestehenden HA-Add-on-Repo)
- GitHub Action: HAOS herunterladen → Add-on injizieren → Release publizieren
- Edge Function `gateway-image-download`: signierte GitHub-Asset-URL ausgeben

### Phase 4 – Hardware-Pilot (extern, parallel)

- 2× Beelink N100 + 1× Onlogic K-100 bestellen, Image flashen, intern testen
- Doku "AICONO Hub – Inbetriebnahme in 5 Minuten" (PDF, layennenfreundlich – Memo-Regel beachten)

### Phase 5 – Cockpit-Polish (0,5 Tag)

- Status-Anzeige "Gateway wartet auf Pairing" → "Online"
- E-Mail-Benachrichtigung an Tenant-Admin bei erfolgreichem Pairing

---

## Offene Punkte zur Klärung vor Phase 1

1. **Repo-Name**: neues `aicono-os` oder Workflow im bestehenden HA-Add-on-Repo unterbringen?
2. **HA Yellow/Green** wirklich als dritte SKU – oder erstmal weglassen, um Komplexität zu sparen?
3. **Pre-Flashed-Versand** ab Tag 1 (AICONO als Reseller) oder erst nach Pilot?
4. **Eigene Captive-Domain** `aicono.local` per mDNS – oder bleiben wir bei `homeassistant.local:8123/ingress`?