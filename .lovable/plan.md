# 🚗⚡ Monta-Style Ladepunkt-Onboarding für AICONO EMS

## 🎯 Ziel

Ein klarer, geführter Prozess, mit dem ein Installateur (oder Super-Admin) eine **beliebige Wallbox** in Minuten an `wss://ocpp.aicono.org` anbinden kann — egal ob die Box WS oder WSS spricht, mit oder ohne Passwort, mit oder ohne Zertifikat.

---

## 🧠 Logik-Kette (so läuft Onboarding zukünftig ab)

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. EMS: Super-Admin legt Ladepunkt an                            │
│    → OCPP-ID + (optional) Passwort werden im EMS gespeichert     │
│    → Datensatz lebt in Supabase-Tabelle `charge_points`          │
├──────────────────────────────────────────────────────────────────┤
│ 2. EMS zeigt Installations-Karte mit ALLEN nötigen Werten        │
│    → URL (WS oder WSS), ID, Passwort (falls gesetzt), CA-Hinweis │
├──────────────────────────────────────────────────────────────────┤
│ 3. Installateur trägt diese Werte in die Wallbox ein             │
│    (Konfig-Web-UI der Box, z.B. Compleo, ABL, KEBA, go-e, …)     │
├──────────────────────────────────────────────────────────────────┤
│ 4. Wallbox baut OCPP-WebSocket zu ocpp.aicono.org auf            │
│    → Hetzner-Server liest `ocpp_id` aus URL-Pfad                 │
│    → Lookup in Supabase `charge_points` (gleiche DB!)            │
│    → Falls `ocpp_password` gesetzt: Basic-Auth-Check             │
│    → Falls leer: Verbindung wird ohne Auth akzeptiert            │
├──────────────────────────────────────────────────────────────────┤
│ 5. Server setzt `ws_connected=true`, `last_heartbeat=now()`      │
│    → EMS sieht via Realtime sofort grünen Status                 │
│    → Wizard-Schritt 3 zeigt "✅ Erfolgreich verbunden"           │
└──────────────────────────────────────────────────────────────────┘
```

**Kein separater Sync nötig** — beide Seiten lesen denselben `charge_points`-Datensatz.

---

## 📋 Was der User bekommt

### A) Onboarding-Wizard `/super-admin/ocpp/onboarding`

3-Schritt-Assistent (UI im AICONO-CI):

**Schritt 1 — Wallbox-Stammdaten**

- Name (z.B. "Stellplatz 5")
- Standort + Gruppe (Dropdowns aus DB)
- Hersteller / Modell (frei oder aus Liste)
- Anzahl Connectoren, max. Leistung, Steckertyp

**Schritt 2 — Verbindungs-Konfiguration** ⭐ *Hier landen die 3 neuen Anforderungen*

- **OCPP-ID**:
  - Auto-Generieren (Default: `AICONO-{kurzer-hash}`) **ODER**
  - Manuell setzen (Toggle "Seriennummer der Wallbox verwenden")
- **Protokoll-Wahl** (Radio-Button, neu):
  - 🔒 `wss://` (empfohlen, verschlüsselt) — Default
  - 🔓 `ws://` (für Wallboxen ohne TLS-Support, z.B. ältere Compleo-/ABL-Modelle)
  - **Hinweis-Banner bei `ws://**`: "Unverschlüsselt – nur für Wallboxen die kein TLS unterstützen. Daten werden im Klartext übertragen."
- **Passwort** (neu: optional):
  - Checkbox "Passwort-geschützte Verbindung" (Default: AN, weil empfohlen)
  - Wenn AUS: kein Passwort, Wallbox verbindet sich ohne Auth (Hinweis: "Nur nutzen, wenn Wallbox keine Passwort-Eingabe unterstützt, z.B. einige go-e oder ältere KEBA-Modelle.")
  - Wenn AN: Passwort wird automatisch generiert (32 Zeichen, anzeigbar/kopierbar/regenerierbar)
- **Zertifikat** (Vorbereitung für später):
  - Read-only Info-Box: *"Falls Ihre Wallbox eine Server-Zertifikat-Auswahl verlangt: 'Amazon Root CA 1' oder 'Let's Encrypt R3' wählen. Eigene Zertifikate werden in einer kommenden Version unterstützt."*
  - **Daten-Modell wird jetzt schon erweitert** (`certificate_required: boolean`, `certificate_type: text`) — damit Migration nicht doppelt nötig ist

**Schritt 3 — Installation & Verifikation**

- Installations-Karte mit allen Werten zum Kopieren:
  - Server-URL: `wss://ocpp.aicono.org/<ocpp_id>` *oder* `ws://ocpp.aicono.org/<ocpp_id>` (je nach Wahl)
  - ChargeBox ID: `<ocpp_id>`
  - Passwort: `<ocpp_password>` (oder "— keines —")
  - Port-Hinweis: 443 (WSS) bzw. 80 (WS)
  - Zertifikat: "Amazon Root CA 1" empfohlen
- **Live-Status-Badge**: Zeigt via Supabase Realtime sofort wenn Wallbox sich verbindet
  - 🟡 "Warte auf Verbindung…" (initial)
  - 🟢 "Verbunden! BootNotification empfangen" (Erfolg)
  - 🔴 "Verbindung abgewiesen — Passwort prüfen" (bei 401)
- "Anleitung als PDF herunterladen" (für Installateur-Übergabe)

### B) Anpassung Hetzner-Server (`docs/ocpp-persistent-server`)

Notwendige Änderungen, damit Punkt 1 + 2 funktionieren:

1. `**src/server.ts**`:
  - Server lauscht **zusätzlich auf Port 80 (HTTP/WS)**, nicht nur 443 (HTTPS/WSS)
  - Caddy/Traefik-Konfig erlaubt beide Protokolle (Update für `docker-compose.yml` + Reverse-Proxy-Config)
2. `**src/auth.ts**` (`checkBasicAuth`):
  - Wenn `expectedPassword` in DB `NULL` oder leer → Verbindung ohne Auth-Header akzeptieren (already structurally close, kleine Anpassung)
  - Wenn Passwort gesetzt → wie bisher Basic-Auth prüfen
3. **README im `ocpp-persistent-server/`-Ordner aktualisieren**: Hinweis auf Dual-Port-Betrieb + Beginner-Anleitung wie man Port 80 in Hetzner-Firewall öffnet

### C) Datenbank-Migration

Erweitert `charge_points`:

```sql
ALTER TABLE public.charge_points
  ADD COLUMN connection_protocol text NOT NULL DEFAULT 'wss'
    CHECK (connection_protocol IN ('ws','wss')),
  ADD COLUMN auth_required boolean NOT NULL DEFAULT true,
  ADD COLUMN certificate_required boolean NOT NULL DEFAULT false,
  ADD COLUMN certificate_type text;  -- 'amazon-root-ca-1' | 'lets-encrypt-r3' | 'custom' | NULL
```

- Bestehende Datensätze: `connection_protocol='wss'`, `auth_required=true` (rückwärtskompatibel)
- Trigger: Wenn `auth_required=false` → `ocpp_password` wird beim Speichern auf NULL gesetzt

### D) Simulator-Anpassung (`SuperAdminOcppSimulator.tsx`)

- Beim Auswählen einer Wallbox aus der DB werden Protokoll (ws/wss) und Passwort-Modus **automatisch** korrekt übernommen
- Manuelle Override-Felder bleiben für Debugging
- Verbindungs-Logik prüft `connection_protocol` und baut entsprechende URL

---

## ✅ Was sich NICHT ändert

- ❌ Kein separater Push-Sync nötig (DB ist gemeinsam)
- ❌ Keine neuen Secrets
- ❌ Bestehende Wallboxen (Compleo/Ost 1) bleiben unangetastet — Default `wss + auth_required=true`
- ❌ Keine Pflicht-Migration für laufende Boxen

---

## 📦 Lieferumfang

1. **Migration**: `charge_points`-Erweiterung (4 neue Spalten + Trigger)
2. **Hetzner-Server**: `auth.ts` (optionales Passwort), `server.ts` + Reverse-Proxy (Dual-Port WS/WSS)
3. **Wizard-Komponenten**:
  - `src/pages/SuperAdminChargePointOnboarding.tsx`
  - `src/components/super-admin/onboarding/Step1Stammdaten.tsx`
  - `src/components/super-admin/onboarding/Step2Connection.tsx` (mit Protokoll-Radio + Auth-Toggle + Cert-Info)
  - `src/components/super-admin/onboarding/Step3Verify.tsx` (mit Realtime-Live-Status)
4. **Anpassung**: `ChargePointFormDialog.tsx` (Edit-Dialog erhält dieselben Felder)
5. **Anpassung**: `SuperAdminOcppSimulator.tsx` (übernimmt neue Felder automatisch)
6. **Sidebar**: Neuer Eintrag "Ladepunkt anlegen" mit Plug-Icon
7. **Route**: `/super-admin/ocpp/onboarding`
8. **PDF-Generator**: `generateInstallationPdf()` für Übergabe-Doku an Installateur

---

## 🧪 Erster Test nach Implementierung

1. Klick auf "Ladepunkt anlegen" → Wizard öffnet sich
2. Schritt 1: "TestBox 01" eintragen, Standort wählen
3. Schritt 2:
  - WSS auswählen, Passwort AN → Auto-Generierung
  - **ODER** WS auswählen + Passwort AUS (für Test ungesicherter Boxen)
4. Schritt 3: Werte werden angezeigt; Simulator-Tab in zweitem Browser-Fenster öffnen, "TestBox 01" auswählen, "Verbinden" klicken
5. Onboarding-Wizard zeigt **innerhalb von 1 Sekunde** "🟢 Verbunden!" (via Realtime)

Damit ist der gesamte Flow Ende-zu-Ende validiert — egal ob WS/WSS und egal ob mit/ohne Passwort.

---

## 🔮 Spätere Erweiterung (Zertifikate — schon vorgemerkt)

Für Wallboxen, die ein **eigenes Client-Zertifikat** verlangen (z.B. einige Hypercharger oder ABB Terra), planen wir später:

- Upload-Bucket für `.pem`/`.crt`-Dateien
- Zuweisung pro Ladepunkt
- Hetzner-Server validiert Client-Cert via mTLS
- Spalten `certificate_required` + `certificate_type` sind **bereits jetzt im Schema** — keine erneute Migration nötig

---

## ⏱️ Aufwand

**1 große Iteration** (Wizard + Migration + Hetzner-Anpassung). Nach Freigabe baue ich alles in einem Rutsch.