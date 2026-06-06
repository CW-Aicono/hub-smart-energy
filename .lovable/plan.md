# Welle 4 — U1 bis U8

Reine UI/Frontend-Arbeit. Keine DB-Migrationen, keine Edge-Functions, keine neue Logik.

## Status der "bitte prüfen"-Punkte


| #      | Behauptung                                           | Prüfergebnis                                                                                                                                                                                      | Aktion                                                                                                          |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **U4** | Export in EnergyData/EnergyReport bereits drin       | ✅ `EnergyData.tsx` hat CSV-, XLSX- und PDF-Export (`handleExport`, `handleXlsxExport`, `handlePdfExport`). `EnergyReport` ist ein Dispatcher; die Template-Reports haben eigene PDF/HTML-Reports. | **Nichts zu tun.** Wird im Plan abgehakt.                                                                       |
| **U5** | PDF-Download in ChargingBilling vorhanden (im Popup) | ✅ Im Detail-Dialog ist `generateChargingInvoicePdf` + `downloadBlob` verdrahtet (Zeile 584–597).                                                                                                  | **Nichts zu tun.** Optional: zusätzlicher Direkt-Download-Button in der Zeilenaktion der Tabelle — frage unten. |
| **U6** | Bulk-Actions in Tasks bereits drin                   | ✅ `Checkbox` + `selectedIds` + `BulkActionsToolbar` aktiv.                                                                                                                                        | **Nichts zu tun.**                                                                                              |


→ U4, U5, U6 werden im Plan dokumentiert als „verifiziert, kein Handlungsbedarf". Keine Code-Änderung.

## Umzusetzende Punkte

### U1 — NetworkInfrastructure als Beta markieren

- `src/pages/NetworkInfrastructure.tsx`: Badge „Beta" neben H1, dezenter Hinweis-Banner („Zeigt aktuell Beispieldaten. Echte Geräteanbindung folgt."). Keine Funktionsänderung.

### U2 — TenantElectricity: `formatNumber()` statt `toFixed(2)`

- Helper in der Datei (oder Import aus `@/lib/utils` falls vorhanden): `fmtEur(n)` → `n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`.
- 10 Fundstellen in `src/pages/TenantElectricity.tsx` ersetzen (Z. 88, 455–457, 527–530, 550). KWh-Werte ebenfalls auf `de-DE` umstellen.

### U3 — Automation: `CATEGORY_CONFIG` i18n-fähig

- `src/pages/Automation.tsx`: `CATEGORY_CONFIG` → `getCategoryConfig(t)`-Funktion. Labels über `t("automation.category.<key>")` ziehen.
- Translation-Keys ergänzen in `src/i18n/locales/de.ts`, `en.ts`, `es.ts`, `nl.ts` (Sektion `automation.category.*`).

### U7 — Einheitliches Error-Pattern für Silent-Fails

- Reusable Komponente `src/components/common/QueryErrorState.tsx`: zeigt `AlertCircle`-Icon, Fehlermeldung, Retry-Button.
- In `SalesProjects`, `SalesProjectDetail`, `ChargingAppAdmin`, `sharing/SharingInvoices` jeweils `isError`/`error` aus `useQuery` lesen und `<QueryErrorState onRetry={refetch} />` rendern statt leerer UI. Zusätzlich `toast.error(...)` im `onError`-Callback / `useEffect`.

### U8 — EnergySharingMemberDetail: CTA bei „nicht unterzeichnet"

- Vertrag-Card: Wenn `!latestSig`, statt nur Text → Button „Jetzt unterzeichnen" öffnet vorhandenen `SignContractDialog`.
- Zusätzlicher Button „Erinnerung senden" ruft bestehende Edge-Function für Member-Invite erneut auf (`resend-community-invite` o.ä. — prüfe Namen in `supabase/functions`, falls nicht vorhanden, verwende vorhandenen Invite-Flow oder lasse den Button bewusst weg und melde es).

## Technische Details

- **Keine** neuen Routen, **keine** DB-Migration, **keine** Edge-Function (außer evtl. Aufruf einer bestehenden in U8).
- Build-Verifikation am Ende.

## Klärungsfrage zu U8

Eine Sache muss ich vor U8 wissen — ich finde im Repo keine offensichtliche Edge-Function nur für „Erinnerung an Community-Member senden". Soll ich:

- **A)** den vorhandenen Invite-/Onboarding-Flow erneut auslösen (gleiche Funktion wie initial), oder
- **B)** den „Erinnerung senden"-Button weglassen und nur den „Jetzt unterzeichnen"-CTA bauen?

(Wenn keine Antwort: Default = **B**, weil sauberer und kein Risiko, eine falsche Funktion zu treffen.)  
  
Antwort zur Frage zu U8: B