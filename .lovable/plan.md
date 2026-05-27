# Gap-Analyse: Modul „Energy Sharing / Kluub DE"

Stand heute vs. Konzept-PDF (Phase 1–3 + GTM).

## Was bereits steht (Phase 1 MVP, Grundgerüst)

- DB: `energy_communities`, `community_members`, `community_assets`, `community_tariffs` mit RLS/Tenant-Scope
- Rolle `community_member` im `app_role`-Enum
- Modul-Eintrag in `module_prices` (Kommune/Industrie)
- Hook `useEnergyCommunities` (CRUD)
- Page `EnergySharing.tsx` (Community-Manager-UI)
- Route, Sidebar-Eintrag, ModuleGuard verdrahtet
- Edge Function `smart-meter-mscons-import` (Skelett)
- i18n-Key `nav.energySharing`

## Was fehlt – nach PDF-Phasen sortiert

### Phase 1 – MVP-Vervollständigung (Folie 10)

1. **Gründungs-Wizard** (mehrstufig): Stammdaten → PLZ-Region → Erst-Anlage → Erst-Tarif → Vertragsschablone → Aktivierung. Aktuell nur flache Formulare.
2. **Mitglieder-Onboarding-Flow** mit Status-Maschine (`invited → pending_idents → pending_msb → active → suspended → left`) inkl. Einladungs-Mails (Resend) und Token-Link.
3. **Vertragsschablonen-Verwaltung**: Tabelle `community_contract_templates` (Markdown + Platzhalter), Versionierung, PDF-Render (jsPDF), Ablage in Storage-Bucket `community-contracts`.
4. **Digitale Unterschrift**: Minimal-Variante (Checkbox + IP/Timestamp + Hash) jetzt; DocuSign/SignNow als optionaler Connector später (Folie 16).
5. **PLZ-Plausibilität**: Edge Function `community-plz-check` (Open-Data PLZ↔VNB-Mapping) – prüft ob Mitglied im erlaubten Bereich liegt.
6. **MaLo/MeLo-Validierung**: Format-Check + Marktpartner-Lookup (vorerst manuell, später per AS4).
7. **Mitglieder-Detailseite** mit Verbrauch, Anteil, Status, Verträgen, Rechnungen.
8. **Community-Dashboard**: Live-KPIs (Mitglieder, kWh geteilt heute/Monat, ersparte Netzentgelte, CO₂) – Wiederverwendung vorhandener Chart-Komponenten.

### Phase 2 – Allocator & Billing-Engine (Folie 10/16, 40–60 PT)

9. **MSCONS-Import abschließen**: Parser produktiv (nur Skelett vorhanden), Mapping auf `meter_power_readings_5min`, Fehler-Handling, Re-Run.
10. **Allocator-Engine** (Edge Function `energy-sharing-allocator`, pg_cron stündlich): 15-Min-Allokation Erzeugung→Verbrauch nach Verteilschlüssel (gleich / nach Anteil kW / prognosebasiert). Schreibt in neue Tabelle `community_allocations_15min`.
11. **Verteilschlüssel-Engine**: Modi `static_share`, `dynamic_consumption`, `forecast_based` (nutzt vorhandene PV-Prognose).
12. **Preisobergrenze (Hard-Cap)** pro EG konfigurierbar (Risiko-Folie 14) – Feld in `community_tariffs`.
13. **Monatsabrechnung**: Edge Function `energy-sharing-billing-run` → Tabelle `community_invoices` + `community_invoice_lines` (Erzeuger-Gutschrift, Verbraucher-Rechnung, Plattformgebühr 1–2 ct/kWh).
14. **Lexware-Anbindung** wiederverwenden (bereits für EV vorhanden): Buchungsexport pro EG.
15. **SEPA-Lastschrift**: Mandate-Tabelle + SEPA-XML-Generator (`src/lib/sepaXml.ts` existiert bereits → wiederverwenden).
16. **Bilanzkreis-Disclaimer/Workflow**: AICONO=Dienstleister, EG=Lieferant – Vertragsvorlage + UI-Hinweise.
17. **AS4 / EDI@Energy Connector** (MaBiS, MSCONS, UTILMD) – Make-or-Buy-Entscheidung; bis dahin manueller MSCONS-Upload (Phase 1).

### Phase 3 – Marktplatz, Mitglieder-PWA, Steuerung (Folie 10/12, 30 PT)

18. **Öffentlicher Marktplatz** `kluub.aicono.de` (Subdomain auf bestehendem Projekt, neue Route `/kluub` + Custom Domain):
  - PLZ-Suche → Liste verfügbarer EGs (RLS: nur `status='public'`)
    - Community-Profil-Seite (Branding, Mitgliederzahl, Tarif, Anlagen)
    - Beitritts-Wizard (Selbstregistrierung → erzeugt `community_members` mit `status='invited'`)
    - Landingpage / Warteliste vor Go-Live (Folie 17)
19. **Mitglieder-PWA** (analog `manifest-te.json`): neue `manifest-kluub.json` + isolierter Layout-Wrapper analog `TenantEnergyApp` mit `tenantClient`-Pattern. Anzeige: eigener Anteil, monatliche Ersparnis, CO₂, Rechnungs-PDFs.
20. **Push-Benachrichtigungen** (z. B. „Heute besonders viel Sonnenstrom geteilt").
21. **Steuerungs-Layer** (Phase 3, 30 PT): netzdienliche Lastverschiebung – Anbindung an bestehende Building-Automation/EV-Charging-Module (Schaltbefehle bei PV-Überschuss in der EG).

### Querschnitt / Infrastruktur

22. **Storage-Buckets**: `community-contracts` (private), `community-branding` (public, White-Label-Logos).
23. **Edge-Funktionen-Cron** (`pg_cron`): Allocator stündlich, Billing am 1. des Monats, MSCONS-Poll täglich.
24. **Berechtigungen/RBAC**: neue Permissions `community.manage`, `community.invite`, `community.billing` + Rolle `community_admin` (Tenant-Ebene, ≠ `community_member`).
25. **Audit-Log** für EG-relevante Aktionen (DSGVO, Folie 14): Mitglieder-Beitritt, Vertragsunterschrift, Tarifwechsel, Rechnungslauf.
26. **Super-Admin-Sicht** „Energy Sharing Fleet": alle EGs aller Tenants, KPIs (Folie 15: aktive EGs, kWh, Ersparnis, NPS).
27. **Modul-Pricing erweitern**: Setup-Gebühr-Felder, Transaktionspreis ct/kWh in `module_prices` oder neue Tabelle `energy_sharing_pricing`.
28. **i18n**: alle neuen Strings in DE/EN/ES/NL (Memory-Regel).
29. **Tests**: Allocator-Logik (kritisch!) als Unit-Tests in `packages/` analog `automation-core`, Billing-Berechnung, MSCONS-Parser.
30. **Dokumentation**: Onboarding-Guide für Stadtwerke (Word, laymen-friendly – User-Memory).

### Rechtlich / extern (Folie 17, nicht Code)

- Anwalts-Review §42c (5–8 k€) – wartet auf Pilotpartner
- E-Signatur-Anbieter wählen (DocuSign vs. SignNow)
- Optional Schufa-API für Bonität
- Zwei Pilot-Stadtwerke akquirieren

## Empfohlene Reihenfolge (nächste Iterationen)

1. **Iteration A** (jetzt sinnvoll, klein): Punkte 1, 3, 4 (Wizard + Vertragsschablonen + Minimal-Signatur) – macht das vorhandene UI Pilot-tauglich.
2. **Iteration B**: 2, 5, 6, 7, 8 (Mitglieder-Lifecycle + Community-Dashboard) – schließt Phase 1 ab.
3. **Iteration C**: 9–13 (MSCONS produktiv + Allocator + Billing) – Phase 2 Kern.
4. **Iteration D**: 18 + 19 (Marktplatz + Mitglieder-PWA) – Phase 3 + GTM.
5. **Iteration E**: 14–17, 21 (Lexware/SEPA/AS4/Steuerung) – Industrialisierung.

## Aufwandsabgleich mit PDF

- Phase 1: PDF sagt 25–35 PT. Bisher geschätzt ~5 PT umgesetzt → **20–30 PT offen**.
- Phase 2: 40–60 PT komplett offen.
- Phase 3: 30 PT komplett offen.
- Querschnitt + Tests + Doku: ~10–15 PT zusätzlich.

**Gesamt-Restaufwand: ~100–135 PT** (deckt sich mit PDF).

## Out of Scope dieser Analyse

- Konkrete Implementierung (folgt nach Freigabe einer Iteration)
- Rechts-/Vertragsinhalte (extern)
- Hardware-Beschaffung iMSys (Kunde/Pilot)

---

**Frage an dich:** Mit welcher Iteration (A–E) soll ich als Nächstes starten? Empfehlung: **Iteration A** – kleinster Schritt mit höchstem Pilot-Nutzen.  
  
Antwort: Ja, Iteration A umsetzen