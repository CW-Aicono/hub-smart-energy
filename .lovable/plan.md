## Ursache

In der Datenbank existiert ein Unique-Index `idx_adhoc_rules_tenant_unique` auf `adhoc_payment_rules`, der pro Mandant nur **eine** Regel mit Geltungsbereich „Mandant (Basis)" erlaubt. Da bereits eine solche Regel ("Ad-Hoc Standard") existiert, schlägt das Anlegen von „Ad-Hoc Standard 02" mit demselben Geltungsbereich fehl. Die rohe Postgres-Fehlermeldung wird ungefiltert im Toast angezeigt.

Das ist fachlich gewollt: Die Mandanten-Regel ist der globale Fallback (siehe Hinweistext „spezifischste Regel gewinnt — Ladepunkt > Gruppe > Mandant"). Mehrere Basis-Regeln wären nicht auflösbar.

## Was zu tun ist

1. **`src/components/charging/adhoc/PaymentRulesPanel.tsx`**
   - Prüfen, ob für den Mandanten bereits eine Regel mit `scope = "tenant"` existiert.
   - Wenn ja: Im „Neue Regel"-Dialog den Geltungsbereich „Mandant (Basis)" deaktivieren (SelectItem `disabled`) und mit Hinweis „bereits vergeben" versehen.
   - Zusätzlich beim Speichern client-seitig abfangen und einen verständlichen Toast zeigen („Es existiert bereits eine Basis-Regel für diesen Mandanten. Bitte bestehende Regel bearbeiten oder Geltungsbereich Ladepunkt/Gruppe wählen.").

2. **`src/hooks/useAdhocPayment.tsx`** (in `useAdhocRules.upsert.onError`)
   - Fehler mit Code `23505` bzw. Text `idx_adhoc_rules_tenant_unique` in eine lesbare Meldung übersetzen, damit auch andere Aufrufer nicht die technische Meldung sehen.

Keine DB-Änderung — der Unique-Index bleibt (er schützt die Auflösungslogik).