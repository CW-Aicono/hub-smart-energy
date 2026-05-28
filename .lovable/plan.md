# Plan: Energy-Sharing an BDEW-Vorgaben (§42c, §20b EnWG) anpassen

## Ausgangslage

Das Modul bildet heute Gemeinschaft, Mitglieder, Anlagen, Tarife, eine Vertragsschablone, Marktplatz und Abrechnung ab. Die BDEW-Informationen verlangen darüber hinaus eine sauberere juristische Einordnung, mehr Pflichtfelder und einen klaren „Pilot-Charakter“ bis die Bundesnetzagentur Vorgaben veröffentlicht. Schema-Änderungen bleiben additiv — bestehende Daten gehen nicht verloren.

## Was geändert / ergänzt wird

### 1. Pilot-Disclaimer (überall sichtbar)
- Auf der Seite `Energy Sharing` oben ein Hinweis-Banner: *„Pilotbetrieb nach §42c EnWG. Die bundesweite Plattform nach §20b EnWG und die finalen BNetzA-Vorgaben stehen noch aus. Prozesse können sich ändern.“*
- Im Community-Wizard zusätzlich ein Pflicht-Häkchen „Pilot-Risiko verstanden“.

### 2. Teilnahmeberechtigung (KMU- und Anlagen-Check)
Neue Felder, die im Wizard und in der Mitglieder-/Anlagen-Bearbeitung abgefragt werden:

**Mitglied (Letztverbraucher):**
- Unternehmens-Typ: Privatperson / Kleinstunternehmen / Kleines U. / Mittleres U. / Juristische Person ö. Rechts
- Mitarbeiterzahl, Jahresumsatz (EUR), Bilanzsumme (EUR)
- Auto-Klassifikation nach EU-Empfehlung 2003/361/EG mit Ampel (grün = teilnahmeberechtigt, rot = nicht zulässig)

**Anlage (Erzeuger):**
- Gebäudetyp: Einfamilienhaus / Mehrfamilienhaus / Sonstige
- Schwellen-Check: <30 kW EFH bzw. <100 kW MFH → Hinweis „Erleichterung: gilt nicht als Stromlieferant“
- Checkbox „nicht überwiegend gewerblich betrieben“
- Auswahl Betreiber-Rechtsform

### 3. Zwei-Vertrags-Struktur (§42c Abs. 1 Nr. 2 + Nr. 3)
Heute gibt es eine Schablone. Künftig zwei Typen pro Gemeinschaft:
- **Liefervertrag** (Strombezug)
- **Nutzungsvertrag** (gemeinschaftliche Nutzung, Aufteilungsschlüssel, Entgelt)

Umsetzung: neues Feld `template_kind` (`liefer` | `nutzung`) in `community_contract_templates`. Standard-Vorlagen für beide Typen werden im Wizard angeboten. `SignContractDialog` zeigt beide Verträge nacheinander.

### 4. Pflicht-Informationsschreiben (§42c Abs. 6)
Vor Vertragsabschluss muss in Textform übergeben werden:
- Hinweis „keine Vollversorgung möglich“
- „Reststrombezug nötig, ggf. höhere Kosten“
- „Freie Lieferantenwahl bleibt erhalten“

Umsetzung: PDF-Vorlage „Vorvertragliche Information“, automatisch beim Anlegen/Einladen eines Mitglieds erzeugt und im Mitgliedsdatensatz mit Zeitstempel hinterlegt (`pre_contract_info_sent_at`). Im Member-Tab Spalte „Info-Schreiben“ + Button „Erneut senden“.

### 5. Reststromlieferant je Mitglied
Neue Felder am Mitglied: `rest_supplier_name`, `rest_supplier_contract_no`, `rest_supplier_confirmed_at`. Pflichtfeld vor Aktivierung des Mitglieds.

### 6. iMSys-Status & 4-Monate-Frist (MsbG §34)
Neue Felder am Mitglied und an der Anlage:
- `imsys_status`: nicht vorhanden / beantragt / installiert
- `imsys_requested_at` (Datum)
- Anzeige „Frist endet am …“ (4 Monate ab Antrag) mit Ampel
- Mitglied kann erst „aktiv“ werden, wenn iMSys installiert ist

### 7. Bilanzgebiet & Phasenlogik (§42c Abs. 4)
- Neue Community-Felder: `balancing_zone` (Bilanzgebiet) und `grid_operator` (VNB)
- Validierung beim Mitglieds-Anlegen:
  - bis 31.05.2028: Mitglied muss im **gleichen** Bilanzgebiet liegen
  - ab 01.06.2028: auch in angrenzendem Gebiet derselben Regelzone
- Bestehende `community-plz-check` Edge-Function um `balancing_zone` erweitern.

### 8. Messung & Aufteilungsschlüssel
- Pro Mitglied: `metering_type` (`zaehlerstandsgang` | `15min_leistung`) gemäß §42c Abs. 1 Nr. 6/7
- Beim Aufteilungsschlüssel der Anlage Tooltip-Erläuterung „statisch = Wizard-Anteil, dynamisch = nach Verbrauch je 15 min“
- Tarif-Maske: Hinweistext „Netzentgelte, Steuern, Abgaben und Umlagen werden separat abgerechnet — keine Befreiung.“

### 9. Rollen klarer trennen
Im Mitglieder-Tab Rollen-Dropdown erweitern:
- Anlagenbetreiber, Letztverbraucher, Dienstleister, Reststromlieferant (nur Info, nicht Teil der Gemeinschaft)
- Sidebar-Hinweis: „VNB/MSB nehmen keine wirtschaftliche Rolle ein.“

### 10. EE-Nachweis
Pflicht-Checkbox an der Anlage: „Strom stammt zu 100 % aus erneuerbaren Energien“ + optionaler Upload (EEG-Bescheid, Herkunftsnachweis).

---

## Technische Details (für Entwickler)

**Migration (additiv, keine Datenverluste):**

```text
ALTER TABLE community_members ADD COLUMN
  customer_class text,          -- privat | kleinst | klein | mittel | jur_oer
  employees int,
  annual_revenue_eur numeric,
  annual_balance_eur numeric,
  rest_supplier_name text,
  rest_supplier_contract_no text,
  rest_supplier_confirmed_at timestamptz,
  imsys_status text default 'missing',
  imsys_requested_at date,
  imsys_installed_at date,
  metering_type text,
  pre_contract_info_sent_at timestamptz;

ALTER TABLE community_assets ADD COLUMN
  building_type text,           -- efh | mfh | sonstige
  not_commercial bool default true,
  operator_legal_form text,
  renewable_confirmed bool default false,
  renewable_proof_url text,
  imsys_status text default 'missing',
  imsys_requested_at date;

ALTER TABLE energy_communities ADD COLUMN
  balancing_zone text,
  grid_operator text,
  pilot_acknowledged_at timestamptz;

ALTER TABLE community_contract_templates ADD COLUMN
  template_kind text default 'nutzung'; -- liefer | nutzung
```

**UI-Dateien, die berührt werden (frontend-only, kleinteilig):**
- `src/pages/EnergySharing.tsx` — Pilot-Banner, neue Spalten/Badges, KMU-Ampel, iMSys-Ampel
- `src/components/energy-sharing/CommunityWizard.tsx` — Schritte „Bilanzgebiet + Pilot-Bestätigung“, „EE-Nachweis“, zweite Vertragsschablone
- `src/components/energy-sharing/ContractTemplatesTab.tsx` — Typ-Auswahl `liefer`/`nutzung`
- `src/components/energy-sharing/SignContractDialog.tsx` — beide Verträge unterzeichnen
- Neuer Helper `src/lib/energy-sharing/kmuClassification.ts` für die EU-2003/361/EG-Logik
- Neuer Helper `src/lib/energy-sharing/preContractInfoPdf.ts` (PDF-Generator, analog `generateCommunityInvoicePdf.ts`)

**Edge-Functions:**
- `community-plz-check` um `balancing_zone` ergänzen
- Optional: neue Function `community-pre-contract-info` für PDF-Versand

## Was bewusst NICHT geändert wird
- Keine Änderung der bestehenden Daten und keine Migration von Bestandsverträgen.
- Keine Anbindung an die §20b-Plattform (steht noch nicht zur Verfügung).
- Keine Netzentgelt- oder Steuerlogik (gesetzlich keine Befreiung).
- Marktplatz, Billing und Allocation-Logik bleiben unverändert.

## Aufwand
~1 Migration, ~6 UI-Dateien, 2 neue Helper, 1 Edge-Function-Erweiterung. Keine Breaking Changes.
