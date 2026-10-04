# Agent Rules

- Every change gets an entry in `CHANGELOG.md` (internal); customer-visible changes also in `docs/RELEASE_NOTES.md` — keeps team and customers informed.
- Partner module grants to tenants go only through the `partner-set-tenant-module` edge function, which enforces partner ownership and the `partner_modules` portfolio — UI checks alone are not security.
- New Cloud schema changes must also be shipped to the self-hosted Hetzner DB (idempotent SQL) — production does not share the Cloud database.
