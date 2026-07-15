# Project Memory

## Core
AICONO EMS is a B2B multi-tenant energy dashboard (Supabase + React + Edge Functions).
Strict multi-tenancy: always use `.eq("tenant_id", tenant.id)` or `useTenantQuery`.
Dark theme (Blue/Teal/White), capsule shapes, Montserrat/Inter, AICONO CI.
Use Open-Meteo exclusively for weather/forecasts. No OpenWeather.
All PV Actuals and future predictions are positive absolutes, colored Green (HSL 152 55% 42%).
Timestamps from gateways are UTC but displayed in Europe/Berlin local time.
Support 4 languages (DE, EN, ES, NL) via type-safe `t()` dynamic imports.
System uses dual repos: Cloud (Lovable) and HA Add-on (CW-Aicono/ha-addons).
Super-Admin & Tenant sind strikt getrennte Bereiche – niemals vermischen. Super-Admin-Listen filtern auf `tenant_id IS NULL`.
Alle Zahlen IMMER im deutschen Format ausgeben: `toLocaleString("de-DE")` für Achsen, Tooltips, KPIs, Tabellen, Exports — auch ungefragt in neuen Widgets.
ABSOLUTES RATEVERBOT: Niemals raten. Erst verifizieren (Code lesen, DB/Storage prüfen, Edge-Logs, Netzwerk, reproduzieren), dann handeln. Bei Unsicherheit fragen, nicht raten.
Bei „IO budget hoch": NIEMALS zuerst Instance-Upgrade vorschlagen — erst Playbook abarbeiten (slow_queries → pg_stat_statements → Vollscan-Quelle finden).

## Memories
- [Ingest Key Model](mem://technical/security/ingest-key-model) — Zwei-Key-Modell: Tenant-Keys (aic_live_*) in tenant_api_keys vs globaler GATEWAY_API_KEY nur für Hetzner-Bridges
- [Support-Session Bootstrap Plan](mem://features/administration/support-session-bootstrap-plan) — Plan to fix missing features/data in support sessions caused by per-user RLS rows
- [IO-Budget Playbook](mem://technical/performance/io-budget-investigation-playbook) — Schritt-für-Schritt-Analyse hoher Disk-IO-Last, typische Ursachen (count exact, fehlende Indizes)
- [IO-Budget Anzeige-Semantik](mem://technical/performance/io-budget-indicator-semantics) — Lovable-Anzeige ist letzter Alert-Snapshot (max. 48h gehalten), kein Live-Wert; echte IOPS nur via Supabase-Metrics
- [Partner Portal](mem://features/administration/partner-portal) — Sales-Partner-Backend /partner/*, partner.aicono.org Subdomain, partner_members RBAC
- [Project Purpose](mem://project/purpose) — Multi-tenant B2B energy dashboard with autonomous local gateways
- [Module Management](mem://features/administration/module-management) — ModuleGuard system for feature toggling and billing
- [Cost & Revenue Management](mem://features/energy-data/cost-and-revenue-management) — Energy pricing, feed-in tariffs, spot prices, and meter inheritance
- [Dynamic Pricing](mem://features/energy-data/dynamic-pricing) — EPEX Spot day-ahead prices with markups
- [Electricity Module](mem://features/tenant-management/electricity-module) — Tenant electricity model, meter allocation, and billing
- [Public Demo Mode](mem://features/administration/public-demo-mode) — /demo public access without login
- [Demo Mode Integrity](mem://auth/demo-mode-integrity) — Reset session completely when leaving demo mode
- [Ingestion Architecture](mem://technical/api/ingestion-architecture) — gateway-ingest POST endpoint, auth logic, and push gateways
- [Investor Pitchdeck](mem://features/marketing/investor-pitchdeck) — Pitch dashboard embedding, x-pitch-api-key auth
- [History Correction](mem://features/meter-management/history-correction) — Manual meter readings history and deletion logic
- [Super Admin Tools](mem://features/administration/super-admin-tools) — Global management, Lexware billing, infrastructure monitoring, legal docs
- [Multi-Tenancy Core](mem://technical/architecture/multi-tenancy-core) — RLS policies, tenant isolation, super admin global access
- [Task Management](mem://features/operations/task-management-and-monitoring) — Internal/external tasks, integration error auto-resolve
- [Reporting & Analysis](mem://features/energy-data/reporting-and-analysis) — CO2 balance, daily HTML/PDF reports, weather-normalized analysis
- [Onboarding & Support](mem://features/administration/onboarding-and-support) — Welcome wizard, system emails, remote access support
- [UX, Branding & Navigation](mem://style/ux-branding-and-navigation-design) — AICONO CI colors, PWA layouts, status badge tokens
- [Core Management Tools](mem://features/administration/core-management-tools) — RBAC, database backup strategy, demo mode reset
- [Aggregation Logic](mem://technical/energy-data/aggregation-logic) — 5-min power integration, hourly storage, realtime fallback
- [Loxone Integration](mem://features/gateways/loxone-automation-and-data) — Data signs, peak filtering, control commands mapping
- [Multi-Language System](mem://technical/i18n/multi-language-implementation) — i18n aliases, type-safe fallback, translation loading
- [Invoice OCR](mem://features/energy-data/invoice-management-and-ocr) — Gemini 2.5 Pro invoice parsing, fuzzy location matching
- [Edge Function Auth](mem://technical/security/edge-function-auth-policy) — authClient and SUPABASE_SERVICE_ROLE_KEY background job validation
- [Hetzner Deployment](mem://technical/infrastructure/deployment-standards-hetzner) — Docker Compose, Traefik/Caddy, minimum specs
- [Core Vulnerability Protection](mem://technical/security/core-vulnerability-protection) — XSS prevention, AES-256-GCM API credentials, @e965/xlsx
- [QA Testing Strategy](mem://technical/testing/qa-and-testing-strategy) — 6-batch Vitest testing, Edge integration tests
- [Mobile Header Layout](mem://style/mobile-header-navigation-layout) — MobileHeader inside DashboardSidebar only
- [PV Yield Forecasting](mem://features/energy-data/pv-yield-forecasting) — GTI-model via Open-Meteo, resilient fetch, fallback
- [EMS Copilot](mem://features/analysis/ems-copilot-functions) — Savings potentials (operational) and investment advisor (ROI)
- [Dashboard Optimization](mem://technical/performance/dashboard-optimization-policy) — useTransition, stale-request filtering, select component
- [Meter Management](mem://features/energy-data/meter-management-and-tracking) — Manual/auto meters, 2D/3D floorplan labels, gas m3 -> kWh
- [Storage RLS Logic](mem://technical/security/storage-rls-policy-logic-isolation) — Use split_part to extract ID and prevent SQL shadowing
- [Integration Seeding](mem://features/administration/integration-seeding-policy) — Default gateway categories via database migration
- [Location & Floor Plans](mem://features/administration/location-and-floor-plan-management) — Iframe PDFs, room polygons, integration dynamic routing
- [Location Energy Sources](mem://features/energy-data/location-energy-sources-management) — Multi-source PV support with useLocationEnergyTypesSet backward compatibility
- [Schneider Electric](mem://features/gateways/schneider-electric-integration-paths) — Push API, GraphQL cloud API, and REST fallback
- [Siemens Gateways](mem://features/gateways/siemens-industrial-gateway-integrations) — IOT2050 (Push), Sentron Powercenter 3000 (Local API)
- [Auth Recovery Guard](mem://auth/auth-recovery-and-security-guard-policy) — RecoveryGuard redirects to /set-password after token exchange
- [Multi-Array PV](mem://features/energy-data/multi-array-pv-forecasting-architecture) — Multiple arrays per location, unique constraints removed
- [Room Polygon Editor](mem://features/administration/room-polygon-drawing-editor-logic) — ResizeObserver for proportional overlays
- [Shelly Cloud Integration](mem://features/gateways/shelly-cloud-integration-and-command-logic) — Gen 1/2+ support, rate limits, label cleaning
- [Shelly Gen1 Logic](mem://features/gateways/shelly-gen1-meter-logic) — Standalone meters from relay arrays
- [HA Addon Requirements](mem://technical/infrastructure/ha-addon-compilation-requirements) — better-sqlite3 compilation, config.yaml strictness
- [Gateway Local Time](mem://features/building-automation/gateway-local-time) — Explicit conversion from UTC to Europe/Berlin in UI
- [Device Representation](mem://features/building-automation/device-ui-representation) — Hardware categorized into meters, sensors, actuators
- [Scheduled Errors](mem://features/building-automation/scheduled-error-visibility) — Visibility rules for automation background job errors
- [Automation Duplication](mem://features/building-automation/automation-duplication) — Duplicate as inactive with "(Kopie)" suffix
- [Device Onboarding](mem://features/building-automation/device-onboarding-workflow) — Conditional rendering based on device type (Meters vs Sensors/Actuators)
- [Pulse Action](mem://features/building-automation/pulse-action) — Duration formatting for 50ms to 10000ms pulses
- [Automation Card UI](mem://features/building-automation/automation-card-ui) — IF/THEN flowchart, realtime actuator status badge
- [Device Classification](mem://technical/architecture/device-classification) — deviceClassification.ts as single source of truth, DB overrides priority
- [HMR Stability](mem://technical/build/hmr-stability-policy) — Static imports for critical pages to avoid dynamic import errors
- [Automation Logic Parity](mem://technical/architecture/automation-logic-parity) — automation-core package consistency across Cloud/Local
- [Gateway Keys](mem://technical/security/per-device-gateway-keys) — SHA-256 hashing, Tenant-ID + Device-ID strict check
- [Priority Buffer Logic](mem://features/building-automation/priority-buffer-logic) — Offline resiliency, priority-flag bypassing FIFO deletion
- [Hub Local UI Ingress](mem://features/gateways/hub-local-ui-ingress) — White-labeled vanilla JS frontend inside HA ingress
- [Manual Trigger Logic](mem://features/building-automation/manual-trigger-logic) — Domain extraction for HA, generic command mapping, 1.5s debounce
- [Automation Verification](mem://technical/testing/automation-logic-verification) — 55+ unit tests for automation-core conditions
- [Device Deduplication](mem://features/meter-management/device-deduplication) — Hide standalone meters if sensor_uuid is linked to gateway
- [Archive & Delete Meters](mem://features/meter-management/archive-and-delete) — Archive/restore/delete für Zähler/Sensoren/Aktoren, FK SET NULL erhält historische Daten
- [AICONO EMS Gateway](mem://features/gateways/aicono-ems-gateway) — HA Addon frontend cards, supervisor API commands
- [Offline Capabilities](mem://features/gateways/aicono-ems-offline-capabilities) — SQLite cache for states, local execution fallback
- [Gateway Status](mem://technical/gateways/status-monitoring-logic) — 3-minute heartbeat threshold, 'Syncing' state
- [Building Automation](mem://features/building-automation/core-logic) — Cross-location (MLA), cloud-scheduler, error logging
- [Connectivity Recovery](mem://technical/gateways/connectivity-recovery-logic) — Relaxed offline guards, 15s timeout, auto-recovery
- [Integrations Page](mem://features/integrations/page-structure) — /integrations layout: Gateways, Mobile Scanner, API
- [Sensor Polling](mem://technical/performance/sensor-polling-intervals) — 1-minute intervals, 30s staleTime
- [Host IP Resolution](mem://technical/gateways/host-ip-resolution) — Supervisor API /network/info for real LAN IP
- [EMS PIN Protection](mem://features/gateways/aicono-ems-pin-protection) — SHA-256 PIN via gateway heartbeat, 1h cookie
- [Widget Designer](mem://features/dashboard/widget-designer) — Interval-based charts, connectNulls, axis formatting
- [Energy Flow Monitor](mem://features/dashboard/energy-flow-monitor) — Realtime SVG topology, reverse animation for feed-in
- [Bidirectional Support](mem://features/meter-management/bidirectional-support) — Split bars for consumption/export, negative Y-axis scaling
- [External Service Resilience](mem://technical/api/external-service-resilience) — fetchWithRetry for Edge Functions (e.g., pv-forecast)
- [Gateway Sync Policy](mem://features/gateways/aicono-ems-sync-policy) — location_integration_id filtering, updated_at versioning, 30m full sync
- [Gamification Levels](mem://features/gamification/age-level-system) — Explorer to Pro age groups, dynamic UI complexity
- [Group Challenges](mem://features/gamification/group-challenges) — Normalized kWh/m2 scoring with handicaps
- [Spot Price Tooltip](mem://features/energy-data/spot-price-tooltip-deduplication) — Deduplicate overlapping chart series, primary/muted color split
- [EV Infrastructure](mem://features/ev-charging/infrastructure-management) — OCPP 1.6, WS/WSS, connector seeding, offline states
- [EV Billing & Compliance](mem://features/ev-charging/billing-and-compliance) — Tariff priority, draft-to-issued workflow, jsPDF generation
- [Dashboard UI Design](mem://features/dashboard/ui-and-performance-design) — Interactive legend pills, refetchOnWindowFocus: false, staleTime 5m
- [Chart Aggregation](mem://features/energy-data/chart-aggregation-logic) — Exclusively 5-minute data on daily chart to filter peaks
- [Automation Redundancy](mem://features/building-automation/automation-architecture-and-redundancy) — Local EMS gateway execution with cloud fallback
- [PWA Architecture](mem://features/mobile/pwa-apps-and-architecture) — Multi-PWA support (Meter Mate, SmartCharge, Mein Strom)
- [ECO-Detect Synergy](mem://strategy/eco-detect-ems-synergy) — Gamification integration, engagement KPI dashboard
- [Weather Provider Policy](mem://features/energy-data/weather-data-provider-policy) — Open-Meteo only, no OpenWeather
- [EV Log Maintenance](mem://features/ev-charging/log-maintenance-and-filtering) — 30-day pg_cron cleanup, CALLERROR filtering
- [PV Surplus Charging](mem://features/ev-charging/pv-surplus-charging) — Scheduler edge function, 3 modes, bidirectional meter logic
- [Gateway-Worker Installation Guide](mem://features/docs/gateway-worker-installation-guide) — Word doc must stay strictly laymen-friendly (no scp/git/jargon)
- [Super-Admin/Tenant Separation](mem://architecture/super-admin-tenant-separation) — Super-Admin zeigt nur Plattform-User (tenant_id IS NULL), super_admin niemals an Tenant-User
- [CP Stability Score](mem://features/ev-charging/stability-score) — Rollende 30-Tage-Stabilität via 5-Min Snapshots (charge_point_uptime_snapshots)
