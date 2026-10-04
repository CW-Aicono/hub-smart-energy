# Agent Rules

- Every change gets an entry in `CHANGELOG.md` (internal); customer-visible changes also in `docs/RELEASE_NOTES.md` — keeps team and customers informed.
- Partner module grants to tenants go only through the `partner-set-tenant-module` edge function, which enforces partner ownership and the `partner_modules` portfolio — UI checks alone are not security.
- Every database schema or shared configuration-data change must be created through the migration tool and committed as idempotent SQL; the Hetzner deploy applies both `supabase/migrations/` and `drizzle/migrations/` automatically because production has a separate database.
- Every user-visible change also updates the in-app user manual (`UserManualContent.tsx` + translations, all 4 languages) — the manual must never describe outdated behaviour.
- The visible app version is the SemVer `version` in `package.json` (MAJOR breaking/large, MINOR features, PATCH fixes), bumped per release together with the Help version history; the commit hash is only technical metadata for update detection and support.
