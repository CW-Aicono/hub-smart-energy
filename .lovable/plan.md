# K1 — Eichrecht + Transparenz-Export (OCMF)

## Ziel

Ladevorgänge an eichrechtskonformen Wallboxen (z. B. ABL eMH3, Alfen Eve, Compleo) sollen so erfasst, gespeichert und ausgegeben werden, dass der Endkunde einen **gerichtsfesten OCMF-Beleg** (Open Charge Metering Format) zu jeder Sitzung herunterladen und mit der **Transparenzsoftware der S.A.F.E. e. V.** prüfen kann. Damit erfüllen wir die rechtliche Pflicht für abrechnungsrelevante E-Mobilitäts-Ladungen in Deutschland (MessEG/MessEV §33, Eichrecht).

## Scope (was umgesetzt wird)

1. **Erfassung signierter Messwerte** aus OCPP 1.6-J MeterValues (Feld `signedMeterValue` / OCPP-Extension `Format=OCMF`).
2. **Persistente Ablage** dieser Werte pro Session (Start- und Stop-Reading, optional Zwischenstände).
3. **Serverseitige OCMF-Erzeugung** als Fallback, wenn die Wallbox nur Rohwerte liefert (CP-Modell-Flag steuert das).
4. **Lokale Anzeige & Download**: Im Detail einer Charging-Session ein neuer Tab "Eichrecht / Transparenz" mit
  - OCMF-Klartext (.ocmf)
  - QR-Code mit Inline-OCMF (Kurzform)
  - Direkt-Link "In Transparenzsoftware öffnen" (S.A.F.E.)
  - Status-Badge ("Signiert geprüft", "Unsigniert", "Signatur ungültig")
5. **Endkunden-Portal**: Auf `PublicChargeStatus` und in der Charging-App (PWA) bekommt der Fahrer denselben Download per öffentlich-zugänglichem signierten Link (analog zu Public-Charge-Status-Links, scoped auf Session).
6. **Rechnungsanhang**: Beim Rechnungsversand (`send-charging-invoices`) hängt jede Session-Zeile ihren OCMF-Beleg als Anhang an die PDF-Rechnung.
7. **Konfigurations-UI**: Pro Charge-Point ein neuer Block "Eichrecht" — Wallbox als eichrechtsfähig markieren, Public-Key der Wallbox hinterlegen (kommt vom Hersteller), Anzeige-Verhalten setzen.
8. **Backfill / Tests**: 55+ Unit-Tests für OCMF-Parser/Serializer + Signatur-Verifikation (sec256k1 / sec384r1, je nach Hersteller).

## Out of Scope (bewusst nicht in K1)

- Eigene PTB-Zulassung — wir sind reines Anzeigesystem (Backend für Eichrecht-Daten, das selbst nicht eichpflichtig ist, weil Messwert + Signatur unverändert durchgereicht werden).
- Wallboxen ohne Hersteller-Public-Key — werden als "Unsigniert" markiert, OCMF wird trotzdem gespeichert.
- AC-Rohwert-Signierung durch uns selbst (würde Zulassung erfordern).

## Architektur / Datenfluss

```text
Wallbox ──OCPP MeterValues(signedMeterValue, OCMF)──▶ ocpp-persistent-server
                                                           │
                                                           ▼
                                       INSERT charging_session_meter_records
                                       (raw_ocmf, sample_context, ts)
                                                           │
                                                           ▼
              StopTransaction ──▶ Edge Fn 'ocmf-finalize' ─┴─▶ charging_sessions.ocmf_payload
                                                           │
                                                           ▼
                                              Frontend Session-Detail
                                              ├── Download .ocmf
                                              ├── QR-Code Inline
                                              ├── S.A.F.E. Deeplink
                                              └── Signatur-Verifikations-Badge

Public/PWA  ──signed link──▶  Edge Fn 'public-ocmf-download' (verify_jwt=false, Token-basiert)
```

## Schritte (Reihenfolge der Umsetzung)

1. **DB-Migration**
  - Neue Tabelle `charging_session_meter_records` (session_id, ts, context, raw_ocmf, signed_value, public_key_ref, verification_status).
  - Spalten an `charging_sessions`: `ocmf_payload TEXT`, `ocmf_status TEXT` (`signed|unsigned|invalid|pending`), `ocmf_public_key_fingerprint TEXT`.
  - Spalten an `charge_points`: `eichrecht_enabled BOOL`, `meter_public_key TEXT`, `meter_format TEXT` (`OCMF|ALFEN|NONE`).
  - GRANTs + RLS (Tenant-Scope; öffentliche Reads nur über Edge Function mit Token).
2. `**docs/ocpp-persistent-server`-Update**
  - In `ocppHandler.ts` `MeterValues`-Case erweitern: `signedMeterValue` und Sample-`format=OCMF`-Felder erkennen und in `charging_session_meter_records` schreiben.
  - StopTransaction: finales OCMF (sofern Wallbox liefert) in `charging_sessions.ocmf_payload` ablegen.
  - Update-Anleitung im Ordner aktualisieren (Anfänger-tauglich, da auf Hetzner-VM deployed).
3. **Edge Function `ocmf-finalize**` (cron-frei, getriggert aus persistentem Server nach StopTransaction)
  - Liest Meter-Records einer Session, baut OCMF zusammen (Start- + Stop-Reading + Identifier-Block), verifiziert Signatur mit hinterlegtem Public-Key, setzt `ocmf_status`.
  - Bei `meter_format=NONE`: erzeugt unsignierten OCMF-Stub (für reine Anzeige, nicht eichrechtskonform — wird im UI klar gelabelt).
4. **Lib `src/lib/charging/ocmf.ts**`
  - Parser (OCMF → JS-Objekt), Serializer, Signatur-Verifier (secp256r1 / secp384r1 via WebCrypto), QR-Generator, S.A.F.E.-URL-Builder. Inkl. Vitest-Suite.
5. **Edge Function `public-ocmf-download**` (`verify_jwt=false`)
  - Nimmt `?session=<uuid>&token=<hmac>` entgegen, validiert Token, gibt `.ocmf` mit `Content-Disposition: attachment` zurück. Token-Generator in `chargingShareLinks.ts`.
6. **Frontend**
  - Neuer Tab "Eichrecht" in `ChargingSessionDetail` (Cloud + PWA): Status-Badge, Download-Button, QR, S.A.F.E.-Link, "Token-Link teilen"-Button für Endkunde.
  - Charge-Point-Edit-Form: neue Sektion "Eichrecht" (Toggle, Public-Key-Paste-Feld, Format-Select).
  - In `PublicChargeStatus`: Download-Button pro abgeschlossener Session.
7. **Rechnungs-Edge-Function**
  - `send-charging-invoices`: bei jeder Session-Zeile OCMF als zweiten PDF-Anhang einbetten (oder ZIP mit OCMFs, wenn >5 Sessions).
8. **Tests**
  - Unit: OCMF-Parser-Roundtrip, ECDSA-Verify mit Testvektoren von S.A.F.E.
  - Edge-Integration: `ocmf-finalize` mit Mock-Session, `public-ocmf-download` Happy + invalid Token.
  - Manual smoke nach Deploy gegen reale ABL eMH3 (steht bereits in Live-Umgebung).

## Sicherheit / Konformität

- Public-Keys werden als Plaintext gespeichert (sind öffentlich qua Definition).
- Tokens für Public-Download sind HMAC-SHA256 (geteilt mit OCPP-Server-Secret) und session-scoped, kein Listing möglich.
- Rohdaten (`raw_ocmf`) werden **niemals modifiziert** — wir reichen byte-identisch durch. Das ist die rechtliche Voraussetzung dafür, dass wir selbst nicht eichpflichtig sind.
- Audit-Log-Eintrag bei jedem Endkunden-Download.

## Erwartete Datei-Änderungen

```text
supabase/migrations/<ts>_eichrecht_ocmf.sql               (neu)
supabase/functions/ocmf-finalize/index.ts                 (neu)
supabase/functions/public-ocmf-download/index.ts          (neu)
supabase/config.toml                                      (verify_jwt=false für public-ocmf-download)
src/lib/charging/ocmf.ts                                  (neu)
src/lib/charging/__tests__/ocmf.test.ts                   (neu)
src/components/charging/EichrechtTab.tsx                  (neu)
src/components/charging/ChargePointEichrechtForm.tsx      (neu)
src/pages/PublicChargeStatus.tsx                          (Edit: Download-Button)
src/pages/ChargingAppAdmin.tsx / Session-Detail           (Edit: neuer Tab)
supabase/functions/send-charging-invoices/index.ts        (Edit: OCMF-Anhang)
docs/ocpp-persistent-server/src/ocppHandler.ts            (Edit: signedMeterValue)
docs/ocpp-persistent-server/UPDATE-ANLEITUNG.md           (Edit: laienfreundlich)
.lovable/plan.md                                          (ersetzt durch K1-Plan)
```

## Risiken / offene Punkte

- **Hersteller-Varianten**: Alfen nutzt teils proprietäres Format vor OCMF — wir starten mit echtem OCMF + ABL eMH3 als Referenz; Alfen-Adapter ggf. in K1.5.
- **PDF-Größe bei vielen Sessions**: Falls Rechnung mit 30+ Sessions: ZIP-Anhang statt einzelner OCMFs.
- **PWA-Offline**: OCMF-Download braucht Netz — akzeptiert.

## Frage vor Implementierung

1. Sollen wir bei der initialen Umsetzung **nur ABL eMH3** (Live-Referenz vorhanden) als signiertes Format unterstützen und alle anderen als "Unsigniert" einstufen, oder direkt auch **Alfen Eve** mitnehmen (kostet ~30 % mehr Aufwand für Parser-Varianten)?
2. Soll der **Endkunden-Download-Link** per E-Mail mit jeder Rechnung verschickt werden, oder reicht der direkte Download aus der Charging-App/PWA?

Sag mir kurz deine Antworten, dann setze ich K1 in einem Rutsch um.  
  
Antworten:  
zu 1: Ja, direkt auch Alfen Eve mitnehmen. Was fertig ist, ist fertig.  
zu 2: Endkunden-Download-Link per Mail mitverschicken, da nicht jeder Lade-User die App nutzen wird.