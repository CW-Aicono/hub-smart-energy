## Ziel

Klarer 2-Stufen-Workflow für Ladestrom-Rechnungen:
**Erstellen → als Ausgestellt markieren → Per E-Mail versenden**, mit Bestätigungs-Popups, Einzelversand und Wiederholungsversand.

---

## Änderungen im Detail

### 1. Datenbank (Migration)
Neue Spalten in `public.charging_invoices`:
- `email_sent_at timestamptz` – Zeitpunkt des letzten erfolgreichen Versands (NULL = noch nie versendet)
- `email_send_count integer NOT NULL DEFAULT 0` – Anzahl der Versendungen (für „nochmals versendet")

### 2. Edge Function `send-charging-invoices`
- Neuer Modus `mode: "send-selected"` mit Parameter `invoice_ids: string[]`. Verschickt **genau diese** Rechnungen, unabhängig von Zeitraum, und nur wenn `status = 'issued'`. Setzt nach Erfolg `email_sent_at = now()` und erhöht `email_send_count`.
- Bestehender Modus `send` / `both` wird so erweitert, dass standardmäßig **nur noch nicht versendete** Rechnungen (`email_sent_at IS NULL`) und nur ausgestellte (`status = 'issued'`) verschickt werden. Setzt ebenfalls die neuen Felder.
- Modus `generate` gibt die IDs der neu erstellten Rechnungen im Response zurück (`created_invoice_ids: string[]`), damit das UI das Popup direkt mit den richtigen Rechnungen füllen kann.

### 3. Hook `useChargingInvoices`
- `generateInvoices` gibt die neuen `created_invoice_ids` zurück (kein Toast-Count ändern).
- Neue Mutation `finalizeInvoices(invoiceIds: string[])` – setzt mehrere Rechnungen auf `status = 'issued'`.
- Neue Mutation `sendSelectedInvoices(invoiceIds: string[])` – ruft Edge Function mit `mode: "send-selected"` auf.
- Bestehende `sendInvoices` bleibt für Sammelversand erhalten (nur ungesendete + ausgestellte).

### 4. UI – `ChargingBilling.tsx`

**Neuer Dialog A: „Erstellte Rechnungen" (öffnet nach „Rechnungen erstellen")**
- Liste aller in diesem Lauf erzeugten Rechnungen (Checkbox + Rechnungsnr., Nutzer, Betrag, Status-Badge).
- Checkbox „Alle auswählen" oben.
- Button **„Ausgewählte als ausgestellt markieren"** → ruft `finalizeInvoices` für selektierte Entwürfe auf.
- Button **„Schließen"**.

**Neuer Dialog B: „Per E-Mail senden" (öffnet nach Klick auf den bestehenden Button)**
- Zeigt zwei Gruppen für den aktuellen Zeitraum:
  1. **Bereit zum Versand** (`status = 'issued'` AND `email_sent_at IS NULL`) – vorausgewählt.
  2. **Noch im Entwurf** (`status = 'draft'`) – mit Checkboxen + Inline-Button **„Auswahl ausstellen"** / **„Alle ausstellen"**, der `finalizeInvoices` ausführt; danach wandern sie automatisch in Gruppe 1.
- Zusätzlich Info-Zeile: „X bereits versendete Rechnungen werden übersprungen" (mit Toggle „Trotzdem erneut senden").
- Footer-Button **„Jetzt versenden"** → `sendSelectedInvoices` mit allen aktuell ausgewählten IDs. Bei Klick wird sichergestellt, dass keine Entwürfe in der Auswahl sind (sonst Hinweis).

**Erweiterung Rechnungstabelle**
- Neue Spalte „Versendet" mit Datum/Anzahl (oder „—").
- Neue Aktion pro Zeile: **Mail-Icon „Einzeln versenden"**
  - Bei `status = 'draft'`: Bestätigungsdialog „Erst als ausgestellt markieren und versenden?" → führt finalize + sendSelectedInvoices nacheinander aus.
  - Bei `status = 'issued'` ohne `email_sent_at`: direkt `sendSelectedInvoices([id])`.
  - Bei bereits versendeter Rechnung: Bestätigung „Rechnung wurde am … bereits versendet. Erneut senden?" → `sendSelectedInvoices([id])`.

### 5. Edge Function für Sammelrechnungen (Gruppen)
Spiegelung der gleichen Logik in `send-charging-group-invoices` (analoge Spalten/Modi), damit Verhalten konsistent ist.

---

## Verhalten Sammelversand (Button „Per E-Mail senden")
- Versendet **immer nur** Rechnungen mit `status = 'issued'` UND `email_sent_at IS NULL`.
- Entwürfe werden im Popup angezeigt, aber nicht automatisch ausgestellt – der User entscheidet aktiv.
- Bereits versendete werden ausgeblendet (Re-Versand nur über Einzelaktion oder Toggle).

---

## Nicht im Scope
- Massenaktion „Mehrere Rechnungen erneut senden" über Tabelle (nur Einzelversand).
- Anpassungen am PDF-/HTML-Layout.
- Änderungen an `tenant_electricity_invoices` (separates Modul).
