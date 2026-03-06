

## Plan: Automatischer Status-Sync mit Lexware API

### Recherche-Ergebnis

Die Lexware Office API bietet zwei Wege, um den Status einer Rechnung abzufragen:

1. **Voucherlist-Endpoint** (`GET /v1/voucherlist`): Kann nach Status filtern (`draft`, `open`, `paid`, `overdue`, etc.) und liefert den aktuellen Status aller Belege zurück.
2. **Webhooks** (`invoice.status.changed`): Lexware ruft eine Callback-URL auf, sobald sich der Rechnungsstatus ändert. Dies erfordert allerdings eine öffentlich erreichbare URL und eine Event-Subscription.

**Empfohlener Ansatz:** Polling via Voucherlist-Endpoint (einfacher, kein Webhook-Setup nötig). Eine neue Edge Function wird periodisch (z. B. stündlich via pg_cron) den Status aller Rechnungen mit `lexware_invoice_id` bei Lexware abfragen und lokal aktualisieren.

### Status-Mapping

| Lexware-Status | Lokaler Status |
|---|---|
| `draft` | `draft` (Entwurf) |
| `open` | `sent` (Gesendet) |
| `paid` / `paidoff` | `paid` (Bezahlt) |
| `overdue` | `overdue` (Überfällig) |
| `voided` | `voided` (Storniert) |

### Änderungen

**1. Neue Edge Function `supabase/functions/lexware-sync-status/index.ts`**

- Alle `tenant_invoices` mit gesetzter `lexware_invoice_id` laden
- Für jeden Beleg den aktuellen Status über `GET /v1/invoices/{id}` abfragen (einzeln, da Voucherlist nur IDs liefert)
- Status-Mapping anwenden und `tenant_invoices.status` updaten, wenn sich der Status geändert hat
- Rückgabe: Anzahl aktualisierter Belege

**2. Edge Function auch manuell aufrufbar machen**

- Button "Status aktualisieren" auf der Billing-Seite hinzufügen (neben "Alle an Lexware senden")
- Ruft `lexware-sync-status` auf und invalidiert danach die Query

**3. Bestehende `lexware-api` anpassen**

- Nach erfolgreichem Senden: Status automatisch auf `sent` setzen (statt `draft` zu belassen)

**4. Automatischer Cron-Job (pg_cron)**

- Stündlicher Aufruf der `lexware-sync-status` Function, damit Statusänderungen (bezahlt, überfällig) zeitnah übernommen werden

**5. UI-Anpassungen (`src/pages/SuperAdminBilling.tsx`)**

- Neue Spalte "Status" wieder einblenden (read-only, zeigt den von Lexware synchronisierten Status)
- "Status aktualisieren"-Button in der Header-Leiste
- Status-Badge farblich kodiert (Entwurf: grau, Gesendet: blau, Bezahlt: grün, Überfällig: rot)

### Keine DB-Migration nötig
Das Feld `status` existiert bereits in `tenant_invoices`. Ggf. `verify_jwt = false` in `config.toml` für die neue Function setzen.

