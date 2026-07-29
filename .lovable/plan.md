# Status Analytics Studio — was fehlt noch?

Ich habe den Plan (`.lovable/plan.md`) mit dem Code (`src/components/analytics/**`, `src/pages/AnalyticsStudio.tsx`, `src/hooks/useAnalysisWorkspaces.ts`, `useAnalyticsData.ts`, `useDeviceTree.ts`) abgeglichen.

## ✅ Vollständig umgesetzt

**Phase 1 (MVP)** — komplett

- Datenmodell `analysis_workspaces` + Hook `useAnalysisWorkspaces`
- Seite `/analytics-studio`, Sidebar-Menüeintrag
- Geräte-Bibliothek (`AnalyticsSidebar` + `useDeviceTree`)
- Canvas-Grid mit Drag & Drop (`AnalyticsCanvas`)
- Zeitreihen-Block, KPI-Block
- Workspace speichern/laden/löschen (`WorkspaceToolbar`)
- Globaler Zeitraum-Selector (`TimeRangeToolbar`)

**Phase 2 (Erweiterungen)** — komplett

- Heatmap-Block, Korrelations-Scatterplot, Vergleichs-Block, Formel-Block
- Annotationen auf Zeitachse (im `TimeSeriesBlock`)

**Phase 3 (KI & Vertrieb)** — teilweise

- KI-„Was ist hier passiert?" (`AiInsightBlock` + Edge Function `analytics-insight`) ✅
- Was-wäre-wenn-Simulation (`SimulationBlock`) ✅
- Story-Modus (`StoryManagerDialog`, `StoryPresenter`, `storyTypes`) ✅

## ❌ Noch offen

1. **Vorlagenmarktplatz** (Phase 3.4): Es gibt keine `analysis_workspace_templates`-Tabelle und keine Template-Auswahl-UI. Nutzer starten immer mit leerem Canvas.
2. **Event-Annotationen aus `monitoring_alert_events**` (Phase 2, Punkt „Annotationen & Events"): Aktuell nur manuelle Annotationen; automatische Übernahme von Alert-Events fehlt.
3. **Workspace-Sharing UI** (`analysis_workspace_shares`): Tabelle war geplant, aktueller Code nutzt nur `is_shared`-Flag, kein per-User-Sharing mit `can_edit`.
4. **Onboarding-Tour** beim ersten Öffnen (im Plan als Abfangmaßnahme genannt).

## Kleinere Lücken (nice-to-have laut Plan)

- **Rechtsklick-Menü auf Datenpunkten** („Von hier zoomen", „In Dashboard-Widget verwandeln") — nicht implementiert.
- **Automatischer Aggregationswechsel** bei >5.000 Punkten pro Serie — Datenfetcher aggregiert fix je Periode, kein Auto-Downsampling bei Überschreitung.
- **Eigener Zeitraum/Zeitversatz pro Block** — im Plan optional, aktuell übernehmen alle Blöcke den globalen Zeitraum (Story-Modus setzt ihn global, nicht pro Block).

## Empfehlung

Wenn du das Modul „feature-complete" haben willst, würde ich in dieser Reihenfolge nachziehen:

1. **Vorlagenmarktplatz** (größter Marketing-/Onboarding-Hebel) — Templates-Tabelle + „Aus Vorlage starten"-Dialog + 4–5 Seed-Templates (PV-Eigenverbrauch, Heizung, Wallbox, Standort-Benchmark, Wochenreport).
2. **Event-Annotationen** aus `monitoring_alert_events` automatisch in `TimeSeriesBlock` einblenden (Toggle im Block-Setting).
3. **Per-User-Sharing** (`analysis_workspace_shares`) inkl. „Teilen"-Dialog.
4. Optional: Auto-Downsampling, Onboarding-Tour, per-Block-Zeitraum.

Soll ich mit Punkt 1 (Vorlagenmarktplatz) starten, oder alle vier offenen Punkte in einem Rutsch umsetzen?  
  
Antwort: Bitte alle vier offenen Punkte in einem Rutsch umsetzen