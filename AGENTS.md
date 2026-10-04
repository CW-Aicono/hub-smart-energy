# Agent Rules

- Every change gets an entry in `CHANGELOG.md` (internal); customer-visible changes also in `docs/RELEASE_NOTES.md` — keeps team and customers informed.
- Partner module grants to tenants go only through the `partner-set-tenant-module` edge function, which enforces partner ownership and the `partner_modules` portfolio — UI checks alone are not security.
- Every database schema or shared configuration-data change must be created through the migration tool and committed as idempotent SQL; the Hetzner deploy applies both `supabase/migrations/` and `drizzle/migrations/` automatically because production has a separate database.
