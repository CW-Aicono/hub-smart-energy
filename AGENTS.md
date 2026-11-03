# Agent Rules

- Every change gets an entry in `CHANGELOG.md` (internal); customer-visible changes also in `docs/RELEASE_NOTES.md` — keeps team and customers informed.
- Partner module grants to tenants go only through the `partner-set-tenant-module` edge function (portal admins use `portal-set-tenant-module`, which also extends the partner portfolio), which enforces partner ownership and the `partner_modules` portfolio — UI checks alone are not security.
- Every database schema or shared configuration-data change must be created through the migration tool and committed as idempotent SQL; the Hetzner deploy applies both `supabase/migrations/` and `drizzle/migrations/` automatically because production has a separate database; reference data (guides, templates, models, backfills) is never written directly to a database, otherwise staging and live drift apart.
- Every user-visible change also updates the in-app user manual (`UserManualContent.tsx` + translations, all 4 languages) — the manual must never describe outdated behaviour.
- The visible app version is the SemVer `version` in `package.json` (MAJOR breaking/large, MINOR features, PATCH fixes), bumped per release together with the Help version history; the commit hash is only technical metadata for update detection and support.
- Cron-only edge functions must call `rejectIfNotInternal` from `_shared/internalAuth.ts` first — pg_cron sends the service-role key, everyone else must be refused.
- Monthly billing uses one unified price per module (standard/partner columns only); discounts are the only reduction, and a 0 € result becomes a `subscription_notice` document that is never sent to accounting — 0 € invoices cannot be booked.
- AICONO Portal access is area-based (`can_portal_read/write` in SQL, `usePortalAccess` + `SuperAdminWrapper` in UI); `super_admin` means portal admin and portal roles may only be changed by portal admins — UI area checks are navigation only, RLS enforces.

- Display-role wording changes must preserve role enum values, route paths and authorization logic — labels must never change access rights.

- New bookings are priced via the package catalog (`pricing_packages` + `src/lib/packagePricing.ts`), while tenants without a package booking keep the legacy `module_prices` billing — existing customers must never be repriced automatically.

- Portal module pricing and bundles share route-backed navigation tabs while retaining their existing URLs and authorization wrappers, so deep links and permissions remain unchanged.

- Automatic invoices are created only as drafts with a unique `source_ref` per triggering event (`_shared/invoiceDrafts.ts`, `create_setup_invoice` trigger) and partner-addressed invoices carry `partner_id` — prevents double billing and keeps purchase prices hidden from end customers.
- New package and additional-service contracts reuse transactional `license_sales`/`license_billing_events`; separate modules are rejected for new sales, historical contracts remain billable, and current unit recommendations use `new_sale_uvp` without repricing legacy catalog consumers — preserves customer contracts and separates resale from wholesale.
- Charge points are mirrored as meters via the `sync_charge_point_meter` trigger and `meters.source_charge_point_id`, reusing the existing OCPP forwarding to `linked_meter_id` — one data path, all meter features apply.
- Battery setpoints go through `_shared/elmiAio.ts` (computeStorageSetpointKw) and are delivered to the on-site controller (Loxone virtual input); `energy_storages.allow_grid_discharge` is forced false by trigger — grid discharge stays locked until the grid operator approves.

- OCPP display states remain distinct through chargePointStatus and shared chargePointStatusPresentation; open billing sessions never override reported connector states — preserves physical station truth across all charging views.

- Monthly package invoices are routed by partner billing model in `_shared/partnerInvoiceFlows.ts` (direct, reseller collective invoice per partner/month, commission credit note); issued invoices are corrected only via cancellation RPCs and every invoice PDF embeds ZUGFeRD XML via `src/lib/eInvoicePdf.ts` — one routing source, immutable issued documents, e-invoice duty.
- Individual recurring invoice items use `license_sales.custom_lines` and the existing daily billing event loop; catalog sales delegate to the preserved catalog billing function, while partner-owned custom services never create AICONO wholesale invoices — avoids duplicate billing and package entitlement changes.

- Package booking quotes use `bookingPrice` for two-way percentage/VK synchronization and the selected `starts_on` in preview and submission; preserve immediate entitlements and draft creation — prevents stale discount metadata and date mismatches without changing activation policy.
- Catalog invoice drafts group by tenant, partner, shared request UUID prefix and billing start inside `bill_catalog_license_sale`, retaining sale-level billing events and per-line periods; PDF preview uses current parties for drafts and frozen snapshots for issued documents without issuing — combines batch bookings safely and preserves immutable invoices.
- Explicit capacity uses unit `license_sales` quantities and database creation/restoration guards; managed flags remain enabled once activated, while usage billing excludes capacity contracts — enforces purchased limits without duplicate invoices or reinterpreting legacy tenants.
- Temporary package discounts are saved atomically before the first draft through `finalize_license_sale_discount`; preview and SQL price each half-month once, using the stored list VK outside the window and unchanged EK — prevents first-invoice mismatch and double discounts without repricing legacy sales.
- Tenant sale catalogs use the selected tenant's partner portfolio and refresh on open, focus and while open; partner grants invalidate dependent catalog caches — newly authorized packages must not remain locked by dashboard caching, while server authorization stays authoritative.
- Live deployments execute target-commit scripts, verify actual schema/defaults/triggers/templates/package guards and container function hashes before frontend activation; only idempotent setup migrations replay on drift, failures restore code and the previous image without replaying database dumps — tracking and HTTP reachability alone do not prove completeness, and concurrent writes must survive.
- All tenant creation paths explicitly initialize setup; impersonation checks session classification availability before creating users or tokens and never falls back to unlogged access — schema drift must not bypass handover or consent.
- Partner tenant lists tolerate additive schema rollout, remain scoped by partner ID and surface errors; missing setup state never grants setup access — deployment compatibility must not weaken remote-support consent.

- Package corrections use authorized correct_license_sale and audit rows; draft-only periods may be rebuilt, issued documents are immutable and future changes retain EK — prevents duplicate billing and historical repricing.
- Effective package entitlements are resolved by effective_tenant_modules for UI, scheduler and gateway sync; stored rules are retained and local rules carry known expiry — ends feature execution without deleting data or changing control algorithms.
- Partner invoice previews resolve visual branding from the issuing partner; issuance freezes it in sender_snapshot, and PDFs use only that snapshot afterwards — keeps historical documents independent of later branding changes.
