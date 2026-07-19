# Erweiterung der Loxone-Steuerung: 9 neue AICO-Bausteine

## Ausgangslage

Der aktuelle Loxone-Katalog (Gruppen A–F, 24+ Bausteine) deckt Basisfälle ab: Wallbox-DLM, PV-Überschussladen, statischer Tarif-Deckel, generisches Peak-Shaving, Speicher-Fahrplan, Netzschutz, Heizung/Komfort. Die Analyse der AICONO-Backend-Logik zeigt **7 substantielle Lücken**, bei denen AICONO heute serverseitig steuert oder empfiehlt, ohne dass Loxone lokal mitlaufen kann.

## Neue Bausteine (priorisiert)

**Priorität HOCH (Sicherheit & Compliance)**

1. **AICO_GridCurtailment14a** — §14a EnWG Drosselung mit Prioritätsliste und gesetzlichem Mindestbezug je Gerät (SteuVE). Gerätescharf statt pauschal.
2. **AICO_PeakShavingSoc** — Peak-Shaving mit SoC-Reserve + Hysterese + Idempotenz. Bildet die tatsächliche Backend-Logik ab.
3. **AICO_DlmFallback** — Sicherheits-Fallback für Wallbox-DLM bei stalem Hausanschluss-Messwert.
4. **AICO_ArbitrageDispatch** — Setzt AI-Arbitrage-Empfehlungen aus `arbitrage_strategies` als Speicher-Fahrplan lokal um.

**Priorität MITTEL**
5. **AICO_PeakEventPrecharge** — Vorlade-Zustandsmaschine vor geplanten Peak-Events.
6. **AICO_GridOperatorSignal** — Normalisierter Empfänger für DSO-Signale (Curtailment / Demand-Response / Emergency).
7. **AICO_CommunityAllocation** — Empfängt 15-min-Anteil aus Energiegemeinschaft, gibt lokale Freigabe/Drosselung an Verbraucher weiter.

**Priorität NIEDRIG**
8. **AICO_Co2LoadShift** — Verschiebt schaltbare Lasten in CO2-arme Zeitfenster.
9. **AICO_StorageArbitrageSoc** — Reines Speicher-Trading mit SoC-Grenzen + Mindest-Spread.

## Umsetzung in bestehende Architektur

Für jeden neuen Baustein derselbe End-to-End-Pfad wie bei den 29 vorhandenen — keine neue Infrastruktur nötig:

1. Katalog-Eintrag in `snippetsCatalog.ts`
2. Cloud-Seed in `loxone_template_registry`
3. Master-Stub via `masterStubGenerator.ts`
4. Discovery-Parser erkennt automatisch (Format `AICO_XXX__<Instanz>__<Param>`)
5. Automation-Mapping via `LocationAutomation.tsx` (generisch)
6. Bedienungsanleitung via ✨-Skelett + Editor + Screenshots
7. Injektor listet neuen Baustein automatisch

## Neuer Backend-Baustein (einmalig)

Für **Push-getriebene** Bausteine (Arbitrage, Community, CO2, DSO-Signal) fehlt ein generischer Cloud→Loxone-Push:

- Edge Function `loxone-parameter-push` (Cron 1–5 min, konfigurierbar)
- Liest Quell-Tabelle je Bausteintyp
- Setzt Virtual-Input-Werte am Miniserver
- Logging in `automation_execution_log`

## Reihenfolge & Aufwand

- **Phase 1 (Sicherheit & Compliance, ~2–3 Tage):** GridCurtailment14a, DlmFallback, PeakShavingSoc
- **Phase 2 (Wirtschaftlichkeit, ~2 Tage):** ArbitrageDispatch, PeakEventPrecharge + `loxone-parameter-push`
- **Phase 3 (Ausbau, ~2 Tage):** GridOperatorSignal, CommunityAllocation
- **Phase 4 (Optional):** Co2LoadShift, StorageArbitrageSoc

Nach jeder Phase: Katalog-Version hochziehen, Master-Datei neu erzeugen, Word-Doc ergänzen.

---

## Offene Punkte vor Umsetzung — mit Pro/Kontra

### 1. Sollen Arbitrage / Community / CO2 wirklich **physisch steuern** oder nur Empfehlungen bleiben?

Aktuell schreibt der Backend-Code dort keine `gateway_commands`. Es sind reine Vorschlags-/Abrechnungs-Logiken.

**Option A: Physisch steuern (Cloud → Loxone → Speicher/Verbraucher)**

- **Pro:** Kunde profitiert real (Arbitrage-Erlöse, Community-Anteil wird lokal umgesetzt, CO2-optimierte Ladung passiert automatisch). Klarer USP gegenüber Wettbewerbern, die nur „empfehlen". Vollautomatisierung ohne Kunden-Interaktion.
- **Kontra:** Höherer Umsetzungsaufwand (jeder Baustein braucht Failsafe-Logik, Idempotenz, Konflikt-Priorität mit Peak-Shaving/DLM). Haftungs­fragen (fehlerhafte Arbitrage-Entscheidung = ökonomischer Schaden). Debugging komplex, weil mehrere Regler auf denselben Speicher wirken.

**Option B: Nur Empfehlung / lokale Anzeige & manuelle Freigabe**

- **Pro:** Deutlich schneller umsetzbar (kein Failsafe nötig, keine Konfliktlogik). Kein Haftungsrisiko. Kunde behält Kontrolle. Bausteine dienen als reiner Info-/Freigabe-Kanal (z. B. „Community-Anteil verfügbar: 3,2 kW → grüne LED").
- **Kontra:** Kein tatsächlicher wirtschaftlicher Effekt ohne Kunden-Aktion. Arbitrage-Erlöse werden nicht realisiert. USP verpufft.

**Option C: Hybrid — Arbitrage & CO2 physisch, Community nur anzeigen**

- **Pro:** Arbitrage ist wirtschaftlich am relevantesten, CO2-Verschiebung technisch einfach (Boiler an/aus). Community bleibt Bilanzthema (kein physischer Eingriff nötig). Guter Kompromiss zwischen Nutzen und Risiko.
- **Kontra:** Zwei unterschiedliche Muster im Katalog (kann Kunden verwirren).

**Empfehlung:** Option C — pragmatisch, deckt den größten Business Case (Arbitrage) ab, ohne Community/Bilanzlogik zu überkomplizieren.

---

### 2. §14a-Prioritätsliste — konfigurierbar oder feste Regel?

**Option A: Feste Regel im Baustein (CP > HP > Batt)**

- **Pro:** Keine UI nötig, keine Fehlkonfiguration möglich. Entspricht typischer Kundenerwartung (Auto vor Heizung vor Speicher). Sofort einsetzbar.
- **Kontra:** Passt nicht überall (z. B. Kunde mit Wärmepumpe in Bestandsbau ohne Puffer priorisiert Heizung höher). Kein Handlungsspielraum bei Sonderfällen.

**Option B: Konfigurierbar pro Standort im Tenant-UI**

- **Pro:** Flexibel für alle Kundentypen. Kunde/Installateur setzt Prio-Reihenfolge nach Bedürfnis. Zukunftssicher (z. B. neue Gerätetypen).
- **Kontra:** Zusätzliche UI + Doku nötig. Risiko von Fehlkonfiguration (z. B. Speicher priorisiert → Heizung fällt aus). Rechtlich muss die Mindestleistung je Gerät trotzdem eingehalten werden.

**Option C: Feste Default-Regel + optionale Overrides im UI**

- **Pro:** Out-of-the-box konform, Experten können anpassen. Beste UX für 90 % der Fälle.
- **Kontra:** Zwei Code-Pfade (Default vs. Override) — leicht mehr Wartung.

**Empfehlung:** Option C — Default = gesetzlicher Standard (CP > HP > Batt), Override-Feld im Standort-Detail nur für Installateure sichtbar.

---

### 3. Push-Kanal Cloud → Loxone-Parameter

**Option A: Über den bestehenden WS-Worker (persistente Verbindung nutzen)**

- **Pro:** Verbindung ist bereits offen (Remote Connect), sehr niedrige Latenz (< 1 s). Keine zusätzliche Auth-Runde. Auth-Fehler-Status ist bereits in `sync_status` sichtbar. Nur ein zentraler Code-Pfad für alle Miniserver-Interaktionen.
- **Kontra:** WS-Worker wird noch komplexer (heute reines Read-only-Sampling → nun auch Write-Commands). Fehler im Write-Pfad könnten den Read-Pfad destabilisieren. Deploy-Zyklus geht über Hetzner-Update (Putty).

**Option B: Separater Webservice-Call aus Edge Function (`loxone-parameter-push`)**

- **Pro:** Sauber getrennt (Read = WS-Worker, Write = Edge Function). Read-Pfad bleibt stabil. Deploy erfolgt über normalen Supabase-Deploy (kein Hetzner-Zugriff nötig). Rate-Limiting und Retry-Logik pro Aufruf einfacher.
- **Kontra:** Zweiter Auth-Pfad (Edge Function muss sich separat via Remote Connect anmelden — Login-Overhead pro Push). Höhere Latenz (2–5 s). Miniserver sieht zwei parallele Sessions.

**Option C: Hybrid — WS-Worker leitet Commands weiter, die aus einer neuen DB-Tabelle `loxone_pending_writes` kommen**

- **Pro:** Edge Function schreibt nur in DB (schnell, robust), WS-Worker liest Tabelle und pusht über die bestehende Verbindung. Trennung von Verantwortlichkeiten, aber trotzdem eine physische Verbindung. Analog zum bestehenden `pending_ocpp_commands`-Muster.
- **Kontra:** Zusätzliche Tabelle + Cron/Poll im Worker (leichte Verzögerung 1–5 s). Etwas mehr Code.

**Empfehlung:** Option C — spiegelt das bewährte OCPP-Muster, hält Read/Write logisch getrennt, minimiert Auth-Overhead und erhält die niedrige Latenz.

---

## Nächster Schritt

Bitte für die drei offenen Punkte Optionen bestätigen (oder eigene wählen), danach starte ich mit Phase 1.  
  
Antwort: Ich folge bei den drei Punkten jeweils deiner Empfehlung, also in allen drei Fällen bitte Option C umsetzen.