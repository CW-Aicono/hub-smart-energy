---
name: dashboard-realtime-invalidation
description: Dashboard widgets refresh via Supabase Realtime invalidation on meter_power_readings INSERT, with a 5-min polling fallback (no more 60 s polling)
type: feature
---
Dashboard-Aktualisierung läuft event-getrieben statt per Polling:

- Zentraler Hook `useRealtimeDataInvalidation` (eingebunden in `useDashboardPrefetch`) abonniert EINMAL pro Dashboard-Mount Supabase Realtime auf INSERT in `meter_power_readings`, `meter_readings` und `meter_period_totals`.
- Bei neuen Datenpunkten werden die React-Query-Caches gezielt invalidiert (`energy-data`, `cost-overview`, `sustainability-kpis`, `pie-chart`, `sankey`, `forecast`, `anomaly`, `weather-normalization`, `energy-gauge`, `custom-widget`, `pv-forecast-actual`, `pv-actual`, `gateway-live-power`, `period-sums`, `meter-daily-totals`, `data_completeness` …).
- Throttle: max. 1 Invalidations-Zyklus alle 2 s (5-min Ingest-Jobs schreiben Bursts hunderter Zeilen).
- Fallback-Polling: alle datenbezogenen Hooks (`useGatewayLivePower`, `useGatewayDevices`, `useLoxoneSensors`, `useLoxoneSensorsMulti`, `useInfraMetrics`, `CustomWidget`, `PvForecastWidget`) verwenden `refetchInterval: 5 * 60_000` als Sicherheitsnetz, falls die WebSocket-Verbindung still wegbricht.
- Externe Quellen unverändert: `useSpotPrices` 5 min, `usePvForecast` 30 min.
- Sub-Sekunden-Live (Energy-Gauge) bleibt `useRealtimePower` direkt.

Effekt: ~90 % weniger redundante Queries, sofortige UI-Updates wenn 5-min-Datenpunkt landet, kein „alles lädt"-Flicker mehr.
