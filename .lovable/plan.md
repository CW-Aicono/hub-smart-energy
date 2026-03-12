

# Diagnose und Fix: KI-Rechnungsextraktion – Fehlerbehandlung

## Ursachenanalyse

Ich habe den Code der Edge Function und des Import-Dialogs analysiert. Es gibt **zwei Probleme**:

### 1. Frontend verschluckt Fehlerdetails (Hauptproblem)
In `InvoiceImportDialog.tsx` Zeile 180-184 wird **jeder** Fehler mit derselben generischen Meldung angezeigt:
```
"KI-Extraktion fehlgeschlagen. Bitte Daten manuell eingeben."
```
Die eigentliche Fehlerursache (z.B. "AI not configured", "Rate limit", "No tenant", HTTP-Statuscode) wird nur in `console.error` geloggt, nie dem User gezeigt.

### 2. `supabase.functions.invoke` Fehlerverhalten
Wenn die Edge Function einen nicht-2xx Status zurückgibt, setzt das Supabase SDK `fnError` – aber der Fehlertext enthält oft nur "FunctionsHttpError" ohne den Body. Der tatsächliche Fehlergrund geht verloren.

### 3. Mögliche Backend-Ursachen
- **Kein `LOVABLE_API_KEY`** → "AI not configured"
- **Kein Tenant-Profil** → "No tenant" (403)
- **AI Gateway Fehler** (429/402/500) → generische Meldung
- **Zu große Datei** als Base64 im JSON-Body

## Geplante Änderungen

### Edge Function (`extract-invoice/index.ts`)
- Detailliertere Fehlermeldungen mit Kontext zurückgeben (z.B. AI-Gateway-Statuscode im Error-Body)
- Logging verbessern für Debugging

### Frontend (`InvoiceImportDialog.tsx`)
- Fehlerdetails aus `fnError` und `fnData.error` extrahieren und im Toast anzeigen
- Spezifische Meldungen für bekannte Fehler (Rate Limit, Credits, Auth)
- Warnung mit gelbem Banner im Review-Schritt wenn KI fehlschlug (statt nur Toast)
- `fnError` korrekt auslesen: Bei `FunctionsHttpError` den Response-Body parsen

### Scope
- 2 Dateien: `InvoiceImportDialog.tsx`, `extract-invoice/index.ts`
- Keine DB-Änderungen nötig

