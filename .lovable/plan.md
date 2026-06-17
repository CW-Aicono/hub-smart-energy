## Ziel

Im EMS-Copilot als **erstes Tab** (vor Einsparpotentiale / Investitionsberater) ein neues Tab **"Analytics"** einfügen. Der User stellt in natürlicher Sprache Fragen zu seinen Energie- und Anlagendaten (z. B. *"Welcher Standort hat im Q1 die höchste Grundlast?"*), die KI baut daraus eine strukturierte Analyse (Kennzahl + Chart + Kurz‑Insight), die gespeichert, wieder geöffnet, angeheftet und in den Bord-Dashboard übernommen werden kann.

## Konzept (UX-Vorschlag)

Ein zweispaltiges Layout, gleicher Stil wie die bestehenden Copilot-Tabs:

```text
+-------------------------------------------------------------+
| [Analytics] [Einsparpotentiale] [Investitionsberater]       |
+----------------------+--------------------------------------+
| Linke Spalte         | Rechte Spalte                        |
|----------------------|--------------------------------------|
| Frage stellen        | Ergebnis-Karte (Titel, KPI, Chart,   |
| (großes Textfeld +   | Insight-Text, Quellen-Badge)         |
|  Schnellauswahl von  |                                      |
|  ~8 Vorschlägen)     | [Speichern] [Pin Dashboard] [Teilen] |
|                      | [Als Bericht exportieren PDF]        |
| Standort / Zeitraum  |                                      |
| (optional)           | --- Verlauf / gespeicherte Analysen  |
|                      | Liste mit Such- + Filter,            |
|                      | Pin / Umbenennen / Löschen           |
+----------------------+--------------------------------------+
```

### Smart-Prompt-Vorschläge (One-Click)

Acht kuratierte Fragen, zugeschnitten auf Tenant-Daten:

- "Top 3 Standorte mit höchstem Stromverbrauch im letzten Monat"
- "Wo ist die Grundlast in den letzten 90 Tagen gestiegen?"
- "PV-Eigenverbrauchsquote pro Standort, letzte 30 Tage"
- "Wallbox-Auslastung pro Ladepunkt im laufenden Monat"
- "CO₂-Bilanz Jahresvergleich (YoY)"
- "Welche Zähler haben Datenlücken > 24 h?"
- "Spitzenlast-Tage im aktuellen Monat (Top 5)"
- "Ungewöhnliche Verbrauchstage (Anomalien) – letzte 30 Tage"

Die Liste ist später per Datenbank-Tabelle erweiterbar (Phase 2, optional, nicht Teil dieses Plans).

### Ergebnis-Karte

Pro Analyse zeigt die Karte einheitlich:

- **Titel** (von KI aus Frage abgeleitet)
- **KPI-Block** (1–3 Zahlen, deutsche Formatierung)
- **Chart** (Recharts, Typ je nach Analyse: Bar / Line / Pie / Table)
- **Insight-Text** (3–5 Sätze, was auffällt + Handlungsempfehlung)
- **Quellen-Badge** (welche Tabellen/Zeiträume genutzt wurden — Transparenz)
- **AI-Disclaimer** (vorhandene `AiDisclaimer`-Komponente wiederverwenden)
- **Aktionen:** Speichern, Pin im Dashboard, In Zwischenablage kopieren (Markdown), PDF-Export

### Speicherung & Abruf

- Jede ausgeführte Analyse landet zunächst im **Verlauf** (auto-gespeichert).
- Per Stern/Pin als **"Gespeicherte Analyse"** markieren → erscheint oben in der Liste.
- Suche + Filter (Standort, Zeitraum, Tag).
- Klick auf Eintrag → Karte rechts wird erneut gerendert (ohne neuen KI-Call → keine Credits, kein Re-Run).
- Optional **"Aktualisieren"**-Button → nutzt gleiche Frage + Parameter, ruft KI erneut auf.

### Pin im Dashboard (Mehrwert)

Eine gespeicherte Analytics-Karte kann als **Custom-Widget** ans Tenant-Dashboard angeheftet werden (nutzt vorhandene `custom_widget_definitions`-Tabelle). Damit wird der EMS-Copilot vom Einmal-Tool zur dauerhaften Insight-Quelle.

## Technische Umsetzung

### 1. Datenbank (eine Migration)

Neue Tabelle `public.copilot_analytics_queries`:

- `tenant_id` (FK tenants), `user_id` (FK auth.users)
- `title` (text), `prompt` (text)
- `location_id` (nullable), `period_start` / `period_end` (nullable)
- `result_json` (jsonb: KPIs, Chart-Daten, Insight, Quellen)
- `is_pinned` (bool), `pinned_to_dashboard` (bool)
- `model_used` (text), `tokens_used` (int, nullable)
- Standard `created_at` / `updated_at`

RLS: nur Mitglieder des Tenants lesen/schreiben (Muster wie `copilot_analyses`). Grants gemäß Projektregel (`authenticated`, `service_role`).

### 2. Edge Function `copilot-analytics`

- Input: `{ tenant_id, prompt, location_id?, period_start?, period_end? }`
- Holt **strukturierten Daten-Kontext** für den Tenant (max. ~50 KB JSON):
  - Standortliste, Zähler-Aggregate (Verbrauch / Einspeisung / PV), Wallbox-Sessions, Anomalien aus `meter_power_readings_5min` & `pv_actual_hourly`
  - Zeitraum-bezogen aggregiert (Tag / Monat) — **keine Rohdaten** an die KI
- Ruft `google/gemini-3-flash-preview` mit `Output.object` Schema:
  ```json
  {
    "title": "string",
    "kpis": [{ "label": "string", "value": "number", "unit": "string" }],
    "chart": { "type": "bar|line|pie|table",
               "x_label": "string", "y_label": "string",
               "series": [{ "name": "string", "data": [{"x":"...","y":0}] }] },
    "insight_markdown": "string",
    "sources": ["string"]
  }
  ```
- Speichert das Ergebnis in `copilot_analytics_queries` und gibt es zurück.
- Fehler-Handling: 429 (Rate-Limit) und 402 (Credits) sauber an UI durchreichen.

### 3. Frontend

- `src/pages/Copilot.tsx`: `TabsList` von 2 auf 3 Spalten, neuer `TabsTrigger value="analytics"` als **erstes** Tab, `topTab` Default auf `"analytics"`.
- Neue Komponente `src/components/copilot/AnalyticsTab.tsx` mit:
  - Prompt-Eingabe + Schnellauswahl-Buttons
  - Standort/Zeitraum-Selector (optional)
  - Ergebnis-Karte mit Recharts-Renderer (`AnalyticsResultCard.tsx`)
  - Verlauf/Gespeichert-Liste (`AnalyticsHistoryList.tsx`)
- Neuer Hook `src/hooks/useCopilotAnalytics.ts` (Query + Mutation, invoke der Edge Function, React-Query Cache mit `tenant_id`-Key).
- Deutsche Zahlenformatierung in allen KPIs/Achsen (`toLocaleString("de-DE")`).
- Wiederverwendung: `AiDisclaimer`, vorhandene Card/Tabs/Badge-Tokens.

### 4. Pin im Dashboard (klein gehalten)

Beim Klick auf "Pin Dashboard" wird ein Eintrag in `custom_widget_definitions` mit Verweis auf die Analytics-Query erzeugt. Das eigentliche Widget rendert die gespeicherte `result_json` (keine erneuten KI-Calls).

## Out of Scope (bewusst weggelassen, um Credits zu sparen)

- Mehrsprachigkeit (nur DE wie der Rest des Copilots)
- Bearbeitbarer Chart-Editor (Chart-Typ kommt aus KI-Output)
- Cron-basiertes automatisches Re-Run
- Vergleichs-Modus (Side-by-Side zweier gespeicherter Analysen)

Diese Punkte können bei Bedarf in einer Folge-Anfrage ergänzt werden.

## Erwartetes Ergebnis nach Implementierung

1. Im EMS-Copilot gibt es links das neue Tab **"Analytics"**.
2. User tippt Frage (oder klickt Vorschlag), erhält in ~3–8 Sekunden eine strukturierte Analyse-Karte.
3. Karte ist gespeichert, erscheint im Verlauf, kann gepinnt, exportiert oder ans Dashboard geheftet werden.
4. Alle Daten bleiben strikt tenant-isoliert (RLS).
