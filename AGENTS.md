# Agent Rules

- Every change gets an entry in `CHANGELOG.md` (internal); customer-visible changes also in `docs/RELEASE_NOTES.md` — keeps team and customers informed.
- Partner module grants to tenants go only through the `partner-set-tenant-module` edge function (portal admins use `portal-set-tenant-module`, which also extends the partner portfolio), which enforces partner ownership and the `partner_modules` portfolio — UI checks alone are not security.
- Every database schema or shared configuration-data change must be created through the migration tool and committed as idempotent SQL; the Hetzner deploy applies both `supabase/migrations/` and `drizzle/migrations/` automatically because production has a separate database.
- Every user-visible change also updates the in-app user manual (`UserManualContent.tsx` + translations, all 4 languages) — the manual must never describe outdated behaviour.
- The visible app version is the SemVer `version` in `package.json` (MAJOR breaking/large, MINOR features, PATCH fixes), bumped per release together with the Help version history; the commit hash is only technical metadata for update detection and support.
- Cron-only edge functions must call `rejectIfNotInternal` from `_shared/internalAuth.ts` first — pg_cron sends the service-role key, everyone else must be refused.
- Monthly billing uses one unified price per module (standard/partner columns only); discounts are the only reduction, and a 0 € result becomes a `subscription_notice` document that is never sent to accounting — 0 € invoices cannot be booked.
- AICONO Portal access is area-based (`can_portal_read/write` in SQL, `usePortalAccess` + `SuperAdminWrapper` in UI); `super_admin` means portal admin and portal roles may only be changed by portal admins — UI area checks are navigation only, RLS enforces.

- Display-role wording changes must preserve role enum values, route paths and authorization logic — labels must never change access rights.

- New bookings are priced via the package catalog (`pricing_packages` + `src/lib/packagePricing.ts`), while tenants without a package booking keep the legacy `module_prices` billing — existing customers must never be repriced automatically.

- Portal module pricing and bundles share route-backed navigation tabs while retaining their existing URLs and authorization wrappers, so deep links and permissions remain unchanged.
