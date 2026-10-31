# Portal → Kunden: alte „Module“ und „Lizenz“ durch Pakete ersetzen

## Was du danach siehst
Kundenseite im AICONO Portal, Reiter:

```text
Info | Pakete | Benutzer | Abrechnung | Gain-Sharing | Aktivitätslog
```

**Reiter „Pakete“** (ersetzt „Module“):
1. Schalter „Abrechnung nach Paketen“
2. Gebuchte Pakete + „Paket buchen“ (inkl. Remote-Support, Einrichtung)
3. Karte „Ladeinfrastruktur“: Freischalten + Anzahl Ladepunkte (wird je Ladepunkt abgerechnet), wie im Partnerportal
4. Eingeklappt „Freigeschaltete Funktionen“: nur Ein/Aus-Schalter je Funktion, ohne Preise, für Sonderfälle
5. Nur bei Kunden ohne Paketabrechnung (z. B. Stadt Steinfurt), eingeklappt: „Altvertrag: Modulpreise“ mit der bisherigen Preistabelle, Einzelpreisen und Rabatten

**Reiter „Lizenz“ entfällt:**
- Das alte Lizenzformular (Plan, Preis, Laufzeit) wird entfernt. Es ist kein einziger Lizenzdatensatz vorhanden.
- Zahlungsart und SEPA-Daten (IBAN, BIC, Mandat) sind weiter nötig und wandern in den Reiter „Abrechnung“.

Die Info-Seite zeigt keine Paketbuchung mehr doppelt. Sie zeigt nur noch die Kundendaten und die Kennzahlen.

## Was unverändert bleibt
- Preise, bestehende Buchungen und Abrechnung der Altkunden.
- Rechte: Wer was ändern darf, ändert sich nicht.

## Technische Details
- `src/pages/SuperAdminTenantDetail.tsx`:
  - Tab `modules` umbauen: Inhalt gesteuert über `usePackageBilling(id)`.
  - `PackageBillingSwitch`, `PackageBookingCard`, `LicenseSales` werden aus „Info“ dorthin verschoben.
  - Die Ladeinfrastruktur-Karte nutzt `toggleModule` für `ev_charging` und `ChargePointSubLine`.
  - Die bisherige Preistabelle und `TenantDiscountsCard` kommen in ein `<details>`, das nur bei `!package_billing` erscheint.
  - Die Funktionsschalter ohne Preise kommen in ein eigenes `<details>`.
- Tab `license` entfernen. Die Karte Zahlungsart/SEPA wird in Tab `billing` verschoben, das `tenant_licenses`-Formular und `useTenantLicense` fliegen aus dieser Seite raus.
- Übersetzung neues Tab-Label „Pakete“ in DE/EN/ES/NL.
- Benutzerhandbuch (4 Sprachen), CHANGELOG, RELEASE_NOTES, Version 1.22.0.
- Prüfung im Browser: ein Paketkunde und Stadt Steinfurt (Altvertrag), SEPA-Speichern im Reiter „Abrechnung“.
