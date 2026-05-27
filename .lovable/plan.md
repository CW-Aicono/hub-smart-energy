
# Smart-Meter / iMSys Gateway – Integrationsplan (Rev. 2)

Ziel: Ein neuer, generischer Gateway-Typ `smart_meter_imsys`, der über den **CLS-Kanal des intelligenten Messsystems** Messdaten empfängt und für mehrere Module wiederverwendbar ist (Messdatenerfassung, Mieterstrom §42a, Energy Sharing §42c, Dynamische Tarife §41a, §14a EnWG-Steuerung).

---

## 0. Bewertung des Konzepts (übernommen aus Review)

**Stärken**
- Transport-Abstraktion verhindert Vendor-Lock-in.
- Wiederverwendung bestehender Tabellen statt Neubau.
- Phasenplan realistisch priorisiert.
- BSI/DSGVO/mTLS sind mitgedacht.

**Risiken / Schwachstellen (vor Build adressieren)**
- **Auflösungsmix:** 5-Min- und 15-Min-Werte in derselben Tabelle nur per `source`-Tag zu trennen, kann später in der §42a/§42c-Abrechnung zu subtilen Fehlern führen.
- **EDIFACT/MSCONS-Komplexität ist unterschätzt** – ein robuster Parser ist allein 2–3 Wochen.
- **Phase 1 mit 3–4 Wochen** ist für MVP + HAN-Adapter + MSCONS-Parser ambitioniert → realistisch eher **5–7 Wochen**.

→ Beide Punkte fließen unten in „Pre-Build Entscheidungen" und in den **revidierten Zeitplan** ein.

---

## 1. Grundlagen & Strategie

Ein iMSys besteht aus mME (Zähler), SMGW (BSI-zertifiziertes Gateway), CLS-Kanal (TLS-Tunnel zu externen Marktteilnehmern) und HAN-Schnittstelle (lokale Anzeige).

Vier Datenwege, die wir abdecken müssen:
1. **EMT/HKS-Pull über GWA** (OBIS/COSEM, EDIFACT/MSCONS) – Standardweg.
2. **CLS-Direktkanal** (TLS-Tunnel zu unserem Server) – nahe Echtzeit, Mieterstrom, §14a.
3. **HAN-Adapter / lokales Gateway** (AICONO EMS Gateway via Optokopf/IR/RJ12) – Pilot/MVP ohne GWA-Vertrag.
4. **Manueller MSCONS-Import** (EDIFACT-Datei vom MSB) – Fallback.

Ein **abstrakter Gateway-Typ** mit austauschbaren „Transports" – pro Liegenschaft frei konfigurierbar.

---

## 2. Gateway Registry & UI

Neuer Eintrag in `src/lib/gatewayRegistry.ts`:

```text
type: "smart_meter_imsys"
label: "Smart Meter / iMSys"
edgeFunctionName: "smart-meter-api"
configFields:
  - transport (select: gwa_api | cls_tunnel | han_local | mscons_import)
  - msb_name / msb_market_partner_id (BDEW-Code, 13-stellig)
  - smgw_id (BSI-konforme ID)
  - meter_id (Zählpunktbezeichnung, 33-stellig BDEW)
  - api_endpoint (URL, optional je transport)
  - client_cert_ref (Verweis auf Zertifikat im Tresor)
  - obis_codes (Liste, default 1-0:1.8.0 / 2.8.0 / 1.7.0)
  - read_interval_minutes (1–60, default 15)
  - usage_purposes (multi: metering | mieterstrom | energy_sharing | dynamic_tariff | grid_control)
```

Liegenschafts-Konfiguration läuft über `EditIntegrationDialog`; Polling-Intervall pro Liegenschaft frei wählbar (analog Loxone-Modell).

---

## 3. Datenmodell (Migrationen)

**Entscheidung Pre-Build (siehe §8.1):** Wir führen `resolution_minutes` und `source` als Spalten ein – keine Vermischung undokumentierter Auflösungen mehr.

- `meters` erweitern:
  - `melo_id text` (Marktlokation)
  - `malo_id text` (Messlokation)
  - `smgw_id text`, `obis_code text`
- `meter_power_readings_5min` erweitern:
  - `resolution_minutes smallint not null default 5`
  - `source text not null default 'aicono'`
  - Unique-Index `(meter_id, ts, resolution_minutes)`
  - Alle bestehenden Abrechnungs-Reads filtern explizit auf `resolution_minutes`.
- Neue Tabelle `smart_meter_certificates` (AES-256-GCM analog `api_credentials`, tenant-scoped, RLS, **nur Super-Admin schreibend**).
- Neue Tabelle `smart_meter_mscons_imports` (Audit/Idempotenz: filename, sha256, period_from/to, status, error).
- Neue Tabelle `smart_meter_consents` (MsbG §50, siehe §8.2): tenant_id, location_id, melo_id, consent_text_version, granted_by, granted_at, revoked_at.

Alle neuen Tabellen mit `tenant_id`, `GRANT` für `authenticated` + `service_role`, RLS analog `meters`.

---

## 4. Edge Functions

Eine Familie hinter einem Dispatcher (analog `loxone-api`):

- `smart-meter-api` – sync: `getMeters`, `testConnection`, `getLatestReading`
- `smart-meter-periodic-sync` – pg_cron, respektiert `read_interval_minutes` pro Liegenschaft
- `smart-meter-cls-ingest` – Push-Ingest, mTLS, signierter Body
- `smart-meter-mscons-import` – EDIFACT-Datei aus Storage, idempotent

Interne Adapter:
```text
transports/
  gwaApi.ts        – HTTPS/OBIS-COSEM Pull (Discovergy zuerst, siehe §7.1)
  clsTunnel.ts     – CLS over TLS, Long-Poll/Push
  hanLocal.ts      – HAN/IR via AICONO EMS Gateway (MQTT-Bridge)
  msconsImport.ts  – EDIFACT-Parser (siehe Realismus-Hinweis §6)
```

Sicherheit: Zertifikate nie in Edge-Logs; Background-Jobs validieren `SUPABASE_SERVICE_ROLE_KEY` (Memory „Edge Function Auth").

---

## 5. Wiederverwendung in den Modulen

Gateway ist **passive Datenquelle** – Module konsumieren bestehende Tabellen, jeweils gefiltert auf `resolution_minutes`:

| Modul | Konsumiert | Hinweis |
|---|---|---|
| Messdatenerfassung | `meter_power_readings_5min` | sofort |
| Mieterstrom §42a | dito + `meters.melo_id/malo_id` | Allokation über bestehende Logik |
| Energy Sharing (Kluub DE) | `energy_sharing_allocations` | **strikt `resolution_minutes = 15`** |
| Dynamische Tarife §41a | `dynamic_pricing` + 15-Min-Verbrauch | Abrechnung unverändert |
| §14a Steuerung | `automation-core` + CLS-Schaltbefehl | Phase 3 |

`usage_purposes` ist UI-/Filter-Flag, keine harte Kopplung.

---

## 6. UI-Anpassungen

- Onboarding-Wizard in `Integrations.tsx`: „Welcher Weg?" (4 Transport-Optionen, separate Formulare).
- **Schritt „Einwilligung Anschlussnutzer" verpflichtend** (MsbG §50), schreibt in `smart_meter_consents`.
- Liegenschafts-Detail: neuer Tab „Smart Meter / iMSys" mit MeLo/MaLo, MSB, letztem Empfang, Intervall.
- Super-Admin: Karte `SmartMeterFleetCard` analog `LoxonePollingOverviewCard`.
- Super-Admin: Zertifikatstresor (Upload, Revoke, Renew) – siehe §7.4.

---

## 7. Antworten auf die offenen Punkte (entschieden)

### 7.1 Referenz-MSB für Phase 2: **Discovergy**
REST/OAuth2, gut dokumentiert, im Aggregator-Umfeld erprobt. Tibber = Endkunden-API, ungeeignet. Eigener MSB-Vertrag mittelfristig sinnvoll, für Phase 2 zu aufwändig.

### 7.2 CLS-Endpunkt-Hosting: **Hetzner mit eigenem mTLS-Server**
Cloudflare Workers haben kein Mutual-TLS für eingehende Verbindungen ohne Enterprise-Plan. BSI TR-03109 verlangt echtes mTLS → Hetzner gibt volle Kontrolle über Zertifikatskette und Logging-Compliance. Aufbau analog `docs/ocpp-persistent-server`.

### 7.3 TRuDI-Integration: **Nein für Phase 1–2**, optional Phase 3
Endkunden-Transparenz, nicht Aggregator-Workflow. Eigenes Datenformat + eigene Zertifikate = hoher Zusatzaufwand. Zurückgestellt.

### 7.4 Zertifikatsverwaltung: **Zentral durch Super-Admin** (bis Phase 3)
mTLS-Zertifikate sind keine Endkunden-Kompetenz. Fehlerhafter Upload bricht Datenerfassung. Revocation/Renewal kontrolliert. Upload landet zentral in `smart_meter_certificates`. Self-Service-Wizard frühestens Phase 3.

---

## 8. Pre-Build Entscheidungen (vor Migration zu treffen)

### 8.1 Auflösungs-Trennung – **entschieden: `resolution_minutes`-Spalte**
Keine separate `_15min`-Tabelle (verdoppelt Indices und Realtime-Channels). Stattdessen Spalte `resolution_minutes` (5 oder 15) + Unique-Index `(meter_id, ts, resolution_minutes)`. Alle Abrechnungs-Queries (§42a, §42c, Dynamic Pricing) werden vor Phase 1 angepasst – das ist die teure Stelle, aber sie wird einmalig sauber statt später unter Lastdruck.

### 8.2 MsbG-§50-Einwilligung – **Rechtsprüfung vor Wizard-Bau**
Einwilligungstext, Speicherform, Widerrufsweg und Aufbewahrungsdauer **vor** Wizard-Implementierung mit Datenschutzbeauftragten/Anwalt klären. Tabelle `smart_meter_consents` bleibt einfach (siehe §3), aber Inhalt/Flow muss feststehen, sonst doppelter Build.

---

## 9. Revidierter Zeitplan (Realismus-Korrektur)

**Phase 1 – MVP (5–7 Wochen statt 3–4)**
- Gateway-Typ in Registry + UI-Formular + Einwilligungs-Wizard
- Migration `resolution_minutes` inkl. Anpassung **aller** Abrechnungs-Queries
- Transport `han_local` über AICONO EMS Gateway (Pilot)
- Transport `mscons_import`: **MVP-Parser nur UTILMD + MSCONS-Lastgang**, kein vollständiges EDIFACT
- Super-Admin-Status + Zertifikatstresor (Upload/View)

**Phase 2 – API-Anbindung (4–6 Wochen)**
- Transport `gwa_api` mit Discovergy
- mTLS-Zertifikatsverwaltung produktiv (Revoke/Renew)
- pg_cron Periodic-Sync (per-location 1–15 Min)
- MSCONS-Export an VNB (Aggregator-Rolle für Energy Sharing)
- Voller EDIFACT-Parser (APERAK, CONTRL)

**Phase 3 – CLS & Steuerung (parallel Kluub DE Phase 3)**
- Transport `cls_tunnel` (Push-Ingest, Hetzner-mTLS-Server)
- §14a Schaltbefehle via `automation-core`
- Direktvermarktungs-Schnittstelle
- Optional: TRuDI-Lesepfad für Mieter

---

## 10. Risiko & Rollback

- Jeder Transport per Feature-Flag (`system_settings.smart_meter_transports_enabled`) einzeln aktivierbar – Rollback durch UPDATE.
- `resolution_minutes`-Migration mit Default `5` rückwärtskompatibel; alte Inserts laufen unverändert weiter.
- Zertifikats-Schreibpfad nur für Super-Admin → kein Tenant-User kann Datenerfassung versehentlich brechen.
