## Ziel

Hersteller **ABL** mit allen Modellen, die per **OCPP 1.6 JSON** oder **Modbus TCP** integriert werden können, in der Tabelle "Ladestationsmodelle" (Super-Admin → OCPP-Integrationen) ergänzen. Bei den Modellen, die ein eigenes ABL-Backend-Zertifikat erfordern, wird dies im Hinweisfeld dokumentiert.

## Recherche-Ergebnisse

ABL hat 4 Produktlinien. Filterung nach OCPP- bzw. Modbus-TCP-Fähigkeit:

| Linie | OCPP 1.6J | Modbus TCP | Aufnahme |
|---|---|---|---|
| **eMH1** (Home) | ❌ | ❌ (nur Modbus RTU im Standalone-Modus) | **NEIN** |
| **eMH2** (Controller/Extender) | ✅ (Controller) | ⚠️ (RTU nativ, TCP nur per RS485-IP-Gateway) | **JA** (nur Controller, OCPP) |
| **eMH3** (Controller/Extender, Twin/Single) | ✅ (Controller) | ⚠️ (RTU, TCP per Gateway möglich) | **JA** (nur Controller, OCPP) |
| **em4** (Single/Twin) | ✅ | ✅ | **JA** |

Extender-Varianten (eMH2/eMH3) werden **nicht** als eigenes Modell aufgenommen, da sie keinen eigenen Backend-Anschluss haben — sie hängen am Controller.

## Aufzunehmende Modelle (insgesamt 8)

| Artikel-Nr. | Modell | kW | Protokoll | Eichrecht |
|---|---|---|---|---|
| eMH2 Controller | eMH2 Controller (3,7–22 kW) | 22 | ocpp1.6 | nein |
| 3W2260 | eMH3 Single Controller 22 kW (Standalone) | 22 | ocpp1.6 | ja |
| 3W2263 | eMH3 Twin Controller 2×11 kW | 22 | ocpp1.6 | ja |
| 3W2254 | eMH3 Twin Controller 2×11 / 1×22 kW | 22 | ocpp1.6 | nein |
| 3W2214 | eMH3 Twin Controller 2×11 kW Steckdose | 22 | ocpp1.6 | nein |
| em4 Single Socket | em4 Single (Steckdose, bis 22 kW) | 22 | ocpp1.6 | ja (MID-Variante) |
| em4 Single Cable | em4 Single (Typ-2-Kabel, bis 22 kW) | 22 | ocpp1.6 | ja (MID-Variante) |
| em4 Twin | em4 Twin (2×22 kW) | 44 | ocpp1.6 | ja (MID-Variante) |

## Zertifikat-Frage (Antwort an User)

ABL erlaubt bei den **eMH3 ab Firmware 1.6** und allen **em4** nur Backend-Verbindungen über `wss://` mit einer von ABL freigegebenen Zertifikats-CA (TLS-Pinning).

**Vorgehen, um unser Backend (`ocpp-persistent-server`) freischalten zu lassen:**

1. **Antrag** an `partnerservice@abl.de` bzw. über das ABL Partner Portal (Account erforderlich).
2. **Einreichen:**
   - Backend-WSS-URL (z. B. `wss://ocpp.aicono.org`)
   - Öffentliche Zertifikatskette (Let's Encrypt o. ä.)
   - OCPP-1.6J-Konformitätsbericht (haben wir aus Mennekes-/Keba-Tests vorliegen)
3. **Konnektivitätstest** durch ABL (~2 Wochen)
4. **Aufnahme der CA** in das nächste Firmware-Release (quartalsweise; Bearbeitungszeit insgesamt **4–8 Wochen**)
5. **Kosten:** kein fixer Listenpreis, Partnervertrag erforderlich.

Bis zur Freigabe können eMH2 und ältere eMH3 (FW < 1.6) bereits genutzt werden — diese akzeptieren beliebige öffentlich vertrauenswürdige Zertifikate.

→ Information wird im **`notes`**-Feld der betroffenen Modelle (eMH3 + em4) hinterlegt.

## Umsetzung

**Ein Insert** über das Supabase-Insert-Tool (keine Schemaänderung nötig, Tabelle und RLS existieren):

```sql
INSERT INTO public.charger_models
  (vendor, model, protocol, power_kw, charging_type, notes, is_active)
VALUES
  ('ABL', 'eMH2 Controller (3,7–22 kW)', 'ocpp1.6', 22, 'AC',
   'OCPP 1.6 JSON. Master einer Gruppe (Extender hängen am Controller). Kein Eichrecht.', true),

  ('ABL', 'eMH3 Single Controller 3W2260 (22 kW, eichrechtskonform)', 'ocpp1.6', 22, 'AC',
   'OCPP 1.6 JSON, eichrechtskonform (PTB). Ab FW 1.6: ABL-Backend-Zertifizierung erforderlich (Antrag bei partnerservice@abl.de, ca. 4–8 Wochen).', true),

  ('ABL', 'eMH3 Twin Controller 3W2263 (2×11 kW, eichrechtskonform)', 'ocpp1.6', 22, 'AC',
   'OCPP 1.6 JSON, eichrechtskonform (PTB). Ab FW 1.6: ABL-Backend-Zertifizierung erforderlich.', true),

  ('ABL', 'eMH3 Twin Controller 3W2254 (2×11 / 1×22 kW)', 'ocpp1.6', 22, 'AC',
   'OCPP 1.6 JSON. Ab FW 1.6: ABL-Backend-Zertifizierung erforderlich.', true),

  ('ABL', 'eMH3 Twin Controller 3W2214 (2×11 kW, Steckdose)', 'ocpp1.6', 22, 'AC',
   'OCPP 1.6 JSON. Ab FW 1.6: ABL-Backend-Zertifizierung erforderlich.', true),

  ('ABL', 'em4 Single Socket (bis 22 kW)', 'ocpp1.6', 22, 'AC',
   'OCPP 1.6 JSON. Modbus TCP zusätzlich verfügbar. MID-/Eichrecht-Variante erhältlich. ABL-Backend-Zertifizierung erforderlich.', true),

  ('ABL', 'em4 Single Cable (bis 22 kW)', 'ocpp1.6', 22, 'AC',
   'OCPP 1.6 JSON. Modbus TCP zusätzlich verfügbar. MID-/Eichrecht-Variante erhältlich. ABL-Backend-Zertifizierung erforderlich.', true),

  ('ABL', 'em4 Twin (2×22 kW)', 'ocpp1.6', 44, 'AC',
   'OCPP 1.6 JSON. Modbus TCP zusätzlich verfügbar. MID-/Eichrecht-Variante erhältlich. ABL-Backend-Zertifizierung erforderlich.', true)
ON CONFLICT (vendor, model) DO NOTHING;
```

## Akzeptanzkriterien

- Im Super-Admin → OCPP-Integrationen → "Ladestationsmodelle" erscheinen unter dem Hersteller-Filter **ABL** genau **8** Einträge.
- Alle Einträge haben `protocol = 'ocpp1.6'`, `charging_type = 'AC'` und sind aktiv.
- eMH3- und em4-Einträge enthalten den Hinweis auf die ABL-Backend-Zertifizierung im `notes`-Feld.
- eMH1, Extender-Varianten und das Zubehör "eMS home" werden **nicht** angelegt.
- Optional Folgearbeit (separat, nicht Teil dieses Plans): Modbus-TCP-Templates für em4 in `wallbox_modbus_templates` ergänzen, sobald Phase 5 produktiv ist.
