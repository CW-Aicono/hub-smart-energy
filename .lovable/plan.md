# Plan: Geräte-/Gateway-Tausch & Zählerstand-Offset

## Ziel

Sauberer Umgang mit drei realen Lebenszyklus-Ereignissen:

1. **Gateway-Tausch** (z. B. AICONO/HA-Hardware defekt) – ohne Datenverlust, ohne Neuanlage aller Zähler/Sensoren/Aktoren.
2. **Gerätetausch** (Zähler, Sensor, Aktor defekt) – neues Gerät übernimmt die Identität (Historie, Zuordnung, Automationen) des alten.
3. **Zählerstand-Offset** – Anfangsbestand bei Neukunden, oder Korrektur nach Tausch, damit die in AICONO angezeigten kWh dem realen Display am Zähler entsprechen.

Keine Code-Änderungen mit dieser Nachricht – nur das Konzept zur Freigabe.

---

## Fall 1 – Gateway-Tausch

### Auslöser

Im UI auf der Liegenschafts-/Integrations-Seite: Button **„Gateway tauschen"** am bestehenden Gateway-Eintrag.

### Ablauf

1. Neues Gateway koppeln wie heute (Pairing-Code / Setup-Wizard im HA-Addon).
2. System erkennt: am alten `location_integration_id` hängen bereits **N Zähler / M Sensoren / K Aktoren**.
3. Dialog **„Geräte übernehmen?"**:
   - **(A) Alle Geräte 1:1 übernehmen** (Default, empfohlen)
     – Alle `meters.location_integration_id` werden auf das neue Gateway umgezogen.
     – `sensor_uuid` bleibt erhalten, sofern das neue Gateway dieselben UUIDs meldet (z. B. gleiches HA-Addon mit gleichem MQTT-Discovery).
     – Falls sich UUIDs ändern: Mapping-Schritt (siehe unten).
   - **(B) Manuell zuordnen** – das alte Gateway wird auf „archiviert" gesetzt, Geräte bleiben bestehen, aber als „ohne Gateway"; Nutzer kann jedes Gerät im neuen Gateway-Dialog neu zuordnen.
   - **(C) Verwerfen** – alle alten Geräte werden archiviert (nicht gelöscht!) und das neue Gateway startet leer.

### UUID-Mapping-Schritt (nur falls Option A und UUIDs unterschiedlich)

Tabelle „Altes Gerät → Neues Gerät", per Dropdown gemappt. System schlägt Mapping per Namensähnlichkeit vor. Bei Bestätigung:

- `meters.sensor_uuid` wird auf neue UUID umgesetzt
- `meters.location_integration_id` auf neues Gateway umgesetzt
- alle historischen Daten (`meter_period_totals`, `meter_power_readings_5min`, `meter_readings`) bleiben am `meter_id` hängen – also automatisch erhalten

### Was bleibt erhalten

- Zähler-Historie, Verbräuche, Automationen, Räume/Etagen-Zuordnung, Tarife, Kostenrechnungen, Reports.

### Was wird neu

- Gateway-Eintrag selbst, MQTT-/HA-Credentials, ggf. lokale Sensor-UUIDs.

---

## Fall 2 – Einzel-Gerätetausch (Zähler / Sensor / Aktor)

### Auslöser

Im Gerät-Detail oder in der Geräteliste: Aktion **„Gerät tauschen"**.

### Ablauf

1. Nutzer markiert das **defekte Gerät** als zu tauschen.
2. Dialog **„Wie tauschen?"**:
   - **(A) Gegen ein bereits vom Gateway gefundenes neues Gerät tauschen** – Auswahl aus der „Gefundene Geräte"-Liste (alle Geräte, die noch keiner `meters`-Zeile zugeordnet sind).
   - **(B) Gegen ein manuell angelegtes Gerät tauschen** – nur für manuelle Zähler.
3. System führt den Tausch durch:
   - **`meters.sensor_uuid`** wird auf die neue UUID umgesetzt.
   - **`meters.id` bleibt gleich** ⇒ Historie, Automationen, Räume, Tarife, Kostenrechnungen bleiben unverändert.
   - Das alte Gateway-Device wird intern als „ersetzt durch X" markiert.
4. **Bei Zählern:** Offset-Dialog (siehe Fall 3) zwingend einblenden – neue Hardware fängt typischerweise bei 0 kWh an, das reale Display der Liegenschaft aber nicht.

### Vorteil dieses Ansatzes

Keine Neuanlage, keine kaputten Diagramme, Automationen laufen ohne Neukonfiguration weiter.

---

## Fall 3 – Zähler-Offset (Anfangsbestand & Tausch-Korrektur)

### Problem

- Neukunde startet mit bestehender Liegenschaft → physischer Zähler zeigt z. B. 145.823 kWh; AICONO würde aber bei 0 starten und nur ab Inbetriebnahme zählen.
- Nach Zählertausch zählt das neue Gerät wieder ab 0 hoch; reales Display in der Liegenschaft zeigt aber den alten Stand plus neue kWh.

### Lösung

Pro Zähler zwei neue Felder im Datenmodell:

| Feld | Bedeutung |
|---|---|
| `meter_offset_kwh` | Konstanter Offset, der bei jeder Anzeige zum gemessenen Verbrauchsstand addiert wird. Default 0. |
| `meter_offset_set_at` | Zeitpunkt, ab dem der Offset gilt (für Audit/Reports). |
| `meter_offset_reason` | Enum: `initial_reading`, `device_replacement`, `manual_correction`. |
| `meter_offset_note` | Freitext (optional). |

### UI

- Auf der **Zähler-Detailseite** Box **„Anfangsbestand / Offset"** mit Wert, Datum, Begründung, Notiz.
- Beim **Anlegen eines manuellen Zählers** und bei **Fall 2 (Gerätetausch)** wird der Offset-Dialog automatisch vorgeschlagen.
- Anzeige des Zählerstands überall: `displayed_kwh = sum_of_measured_kwh + meter_offset_kwh`.

### Auswirkungen auf Verbrauchs-Auswertungen

- **Verbrauch über Zeitraum** (kWh/Tag, kWh/Monat) ist **NICHT** vom Offset betroffen – Differenzen bleiben gleich.
- **Zählerstand-Anzeige** (Anfangsbestand + Verlauf der Tageswerte) ist mit Offset.
- **Manuelle Zählerablesungen** (`meter_readings`) werden weiterhin als „abgelesener realer Stand am Zähler" gespeichert (inkl. Offset-Welt). Die Logik, die daraus Verbräuche berechnet, zieht den Offset wieder ab.

### Technisches Modell (Kurzfassung)

Neue Spalten an `meters` (Migration nach Freigabe):

```sql
ALTER TABLE public.meters
  ADD COLUMN meter_offset_kwh numeric NOT NULL DEFAULT 0,
  ADD COLUMN meter_offset_set_at timestamptz,
  ADD COLUMN meter_offset_reason text,
  ADD COLUMN meter_offset_note text,
  ADD COLUMN replaces_meter_id uuid REFERENCES public.meters(id);
```

`replaces_meter_id` wird bei Fall 2 gesetzt – nur für Audit, das aktive `meters.id` bleibt unverändert.

---

## Umsetzungsreihenfolge (3 Stufen, jede einzeln freigabefähig)

### Stufe 1 – Zähler-Offset (kleinster Schritt, sofort nützlich)

- DB-Migration für Offset-Felder
- UI in Zähler-Detail + beim Anlegen manueller Zähler
- Anzeige-Helper, damit alle Stellen den Offset korrekt aufaddieren

### Stufe 2 – Einzel-Gerätetausch

- Action „Gerät tauschen" in Geräteliste + Detail
- Tausch-Dialog mit Auswahl aus „gefundenen Geräten"
- Bei Zählern automatisch Offset-Dialog (nutzt Stufe 1)

### Stufe 3 – Gateway-Tausch

- Action „Gateway tauschen" am Gateway-Eintrag
- Drei Optionen A/B/C
- Optionales UUID-Mapping mit Namens-Vorschlag

---

## Was ich von dir brauche

1. **Freigabe des Konzepts** (oder Anmerkungen / Änderungen).
2. **Reihenfolge bestätigen** (Empfehlung: 1 → 2 → 3).
3. Danach starte ich mit **Stufe 1** (DB-Migration + UI) als erste konkrete Umsetzung.
