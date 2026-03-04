

## Plan: Rechnungspositionen bearbeitbar machen

### Kontext
- Der "Bearbeiten"-Dialog zeigt aktuell nur den Status zur Auswahl an
- Gewünscht: Positionen (line_items) sollen editierbar sein
- **Einschränkung**: Positionen sind NUR editierbar, solange `lexware_invoice_id` NICHT gesetzt ist. Wurde der Beleg bereits an Lexware übermittelt, müssen Änderungen direkt in Lexware vorgenommen werden.

### Änderungen

**1. Edit-Dialog umbauen (`src/pages/SuperAdminBilling.tsx`)**

- Status-Dropdown beibehalten
- Beim Öffnen: `line_items` aus der Rechnung in lokalen State laden
- Für jede Position anzeigen:
  - **Bezeichnung** (Text, editierbar)
  - **Menge** (Number-Input)
  - **Einzelpreis netto** (Number-Input)
  - **Summe** (berechnet, read-only)
- Buttons: Position entfernen, neue Position hinzufügen
- Gesamtbetrag wird automatisch aus Positionen neu berechnet
- Speichern: `line_items`, `module_total`, `support_total` und `amount` in `tenant_invoices` updaten

**2. Lexware-Sperre**

- Falls `lexware_invoice_id` vorhanden: Alle Positions-Felder werden disabled/read-only
- Hinweistext: "Dieser Beleg wurde bereits an Lexware übermittelt. Änderungen an den Positionen müssen direkt in Lexware vorgenommen werden."
- Status-Änderung bleibt weiterhin möglich

### Keine DB-Migration nötig
`line_items` ist bereits ein JSONB-Feld, alle Daten passen in die bestehende Struktur.
