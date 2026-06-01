# Vertriebspartner-Backend — Gesamtkonzept

## 1. Ziel und Hierarchie

Drei strikt getrennte Ebenen mit klarer Sichtbarkeit:

```text
Super-Admin (AICONO)
   │  sieht ALLE Partner + ALLE Tenants
   ▼
Partner-Admin (z. B. Elektrobetrieb Mustermann)
   │  sieht NUR eigene Tenants + eigene Partner-User
   ▼
Tenant-Admin (Endkunde)
   │  sieht NUR seinen eigenen Tenant
```

Neu eingeführt:

- Organisationseinheit **Partner** (heute fehlt sie — `partner_id` zeigt aktuell direkt auf einen einzelnen `auth.users`-Datensatz).
- Rollen `**partner_admin**` und `**partner_user**` als Erweiterung der bestehenden `app_role`-Enum.
- Harte Zuordnung `**tenants.partner_id**` (nullable; NULL = direkter AICONO-Tenant).

## 2. URL- und App-Strategie

Entscheidung: `**partner.aicono.org**` als Subdomain, **eine** gemeinsame Codebasis und ein gemeinsamer Auth-Cookie-Scope auf `.aicono.org`. Kein zweiter Vite-Build.

- Beim Boot erkennt die App `window.location.hostname`:
  - `partner.*` → mountet ausschließlich Partner-Routen, Sidebar/Branding „Partner-Portal".
  - `ems-pro.*` / Hauptdomain → bestehendes Tenant- und Super-Admin-Verhalten unverändert.
- Cross-Login wird über Rolle entschieden: ein Partner-Admin, der sich auf der Hauptdomain anmeldet, wird auf `partner.aicono.org` umgeleitet; ein Tenant-User auf der Partner-Subdomain wird auf seinen Tenant geschickt.
- Caddyfile (Hetzner) bekommt zusätzlich `partner.aicono.org → frontend:80`. CSP wird minimal um `partner.aicono.org` ergänzt. TLS via vorhandenem Universal-SSL (siehe Cloudflare-Tunnel-Memo).
- White-Label-Erweiterung später: optionale Partner-eigene Subdomain (`*.aicono.org`-CNAME oder Custom Domain) wird datenmodell-seitig vorbereitet (`partners.subdomain`, `partners.custom_domain`), aber nicht in Stufe 1 ausgerollt.

## 3. Sales Scout

Beibehalten und **doppelt zugänglich** machen (deine Vorgabe):

- Super-Admin erreicht Sales Scout über `/super-admin/sales` (alle Projekte, alle Partner).
- Partner-Admin/-User erreicht Sales Scout im Partner-Portal über `/sales` (gefiltert auf eigene `partner_id`).
- Das bestehende mobile PWA-Manifest `manifest-sales.json` bleibt für den Außendienst gültig, läuft aber zukünftig im Partner-Kontext.
- Migration: aktuelle `sales_projects.partner_id` (zeigt auf `auth.users.id`) wird auf neue Partner-Organisation umgeschrieben (siehe Abschnitt 5, Schritt 2).

## 4. Funktionsumfang Partner-Portal (Stufe 1)

Bewusst klein gehalten, baut auf vorhandenen Super-Admin-Bausteinen auf:

1. Dashboard: Anzahl eigene Tenants, aktive Module, offene Tasks, Sales-Pipeline-Status.
2. Tenants: Liste, Anlegen neuer Tenants (Wizard analog `SuperAdminTenants`, aber zwingend mit `partner_id = own`), Detailansicht, Remote-Support per bestehendem Impersonation-Flow (`supportView.ts`) — eingeschränkt auf eigene Tenants.
3. Partner-User-Verwaltung: Einladen weiterer `partner_user`/`partner_admin` desselben Partners.
4. Module aktivieren/deaktivieren je eigenem Tenant (vorhandener `ModuleGuard`).
5. Sales Scout (Leads/Angebote/PDF), gefiltert.
6. Abrechnung (Read-only Stufe 1): Übersicht der Großhandelskosten, die AICONO dem Partner pro Monat berechnet (Datenquelle: bestehende Module-Pricing-Tabellen + neue Aggregation).
7. Eigenes Partner-Profil: Logo, Farben, Support-Mail (Vorlage für späteres White-Label).

Bewusst **nicht** in Stufe 1: Endkunden-Rechnungsstellung im Partner-Namen, Custom Domain je Partner, Provisionsabrechnung. Erst nach Wirtschaftsmodell-Entscheidung.

## 5. Technische Umsetzung

Reihenfolge der Migrationen (jeweils eigene SQL-Datei, Approval-pflichtig):

1. **Partner-Organisation**: Tabelle `partners` (id, name, slug, logo_url, primary_color, contact_email, billing_address, subdomain nullable, custom_domain nullable, is_active, timestamps). RLS: Super-Admin volle Sicht; Partner-User sehen nur eigene Zeile.
2. **Partner-Mitgliedschaft**: Tabelle `partner_members` (partner_id, user_id, role enum `partner_admin`/`partner_user`, unique(partner_id,user_id)). Ablöser für `sales_projects.partner_id = auth.uid()`. Bestehende Sales-Projekte werden so migriert, dass für jeden bisherigen Partner-User automatisch ein „Solo-Partner"-Datensatz angelegt und `partner_id` umgehängt wird.
3. **Tenants ↔ Partner**: Spalte `tenants.partner_id uuid NULL REFERENCES partners(id)`. Default NULL für AICONO-Direkt-Tenants. Migration: alle bestehenden Tenants bleiben NULL.
4. **RBAC-Erweiterung**: `app_role` um `partner_admin`, `partner_user` ergänzen. Security-Definer-Funktionen `is_partner_member(uuid)` und `partner_has_tenant_access(uuid)`. **Wichtig**: `guard_privileged_roles`-Trigger so erweitern, dass Partner-Admins **nur** `partner_user` innerhalb ihres eigenen Partners vergeben dürfen — nie `super_admin`, nie fremde Partner.
5. **RLS-Audit ALLER Tenant-Tabellen**: Bestehende Policies erlauben heute Zugriff bei `has_role(super_admin)` ODER `tenant_id = get_user_tenant_id()`. Neue Bedingung als dritter Zweig: `OR partner_has_tenant_access(tenant_id)`. Dieser Schritt ist der risikoreichste — siehe Risiko-Abschnitt.
6. **Hostname-aware Routing in `App.tsx**`: Neuer Layout-Wrapper `PartnerLayout` analog `SuperAdminWrapper`/`SalesLayout`, eigene Sidebar, Guard `usePartnerAccess`. Bestehende Routen bleiben unverändert.
7. **Impersonation-Scope**: `supportView.ts` so erweitern, dass ein Partner-Admin nur Tenants impersonieren darf, deren `partner_id` zu seinen `partner_members` passt. Audit-Log-Eintrag bei jeder Impersonation.
8. **Caddyfile + DNS**: `partner.aicono.org`-Block hinzufügen, CSP `frame-ancestors`/`connect-src` ergänzen. DNS A-Record bzw. Cloudflare-Eintrag.
9. **E-Mails**: Neue Templates „Partner-Einladung", „Tenant-Einladung im Partner-Namen" (Resend-Branding-Pipeline ist vorhanden).

### ASCII-Datenfluss

```text
auth.users ── partner_members ──► partners ◄── tenants.partner_id
     │                                            │
     ▼                                            ▼
 profiles.tenant_id ─────────► tenants (RLS: tenant own OR partner_has_tenant_access OR super_admin)
```

## 6. Risiken und Punkte zur Beachtung

- **RLS-Regression (höchstes Risiko)**: Jede Tabelle mit `tenant_id` braucht den neuen Partner-Zweig. Übersieht man eine, ist entweder ein Partner blind oder ein Partner sieht zu viel. Gegenmaßnahme: automatisierter SQL-Test (Postgres-Script), der für jede Tabelle in `public` mit Spalte `tenant_id` prüft, ob mindestens eine Policy `partner_has_tenant_access` referenziert.
- **Privilege Escalation**: Ein Partner-Admin darf niemals `super_admin` oder einen Partner-Admin eines fremden Partners erzeugen. `guard_privileged_roles` zwingend erweitern und mit Unit-Tests absichern (analog vorhandener Auth-Tests).
- **Impersonation-Missbrauch**: Partner-Admin könnte versuchen, einen fremden Tenant zu impersonieren. Server-seitige Prüfung (Edge Function + DB-Funktion), nicht nur Client-Filter.
- **Wirtschaftsmodell unklar**: Solange offen, keine Endkunden-Rechnungslogik im Partner-Namen bauen. Datenmodell aber so neutral halten, dass beide Varianten (Wholesale, Provision, White-Label-Billing) später ohne Schema-Bruch ergänzt werden können. Konkret heißt das: heute schon `partners.billing_mode` als Enum mit Default `wholesale` vorsehen.
- **Sales-Scout-Migration**: Heute hängen `sales_projects`, `sales_project_attachments`, Storage-Pfade und Edge Functions an `partner_id = auth.uid()`. Migration muss atomar laufen, sonst verlieren Partner kurzzeitig Sicht auf eigene Projekte. Empfehlung: Phase mit Doppel-Policy (alter ODER neuer Pfad), dann Cutover, dann alte Policy entfernen.
- **Subdomain-Auth-Cookie**: Supabase-Session-Token muss auf `.aicono.org` (Punkt davor) gesetzt sein, sonst doppelte Logins. Aktuell nutzt das Projekt zwei isolierte Clients (`client.ts`, `tenantClient.ts`); für das Partner-Portal entweder dritten isolierten Client einführen oder bewusst den Haupt-Client teilen.
- **Branding-Konflikt**: `applyBrandingToCSS` in `useTenant.tsx` überschreibt heute globale CSS-Variablen. Auf `partner.aicono.org` darf das Tenant-Branding nicht in den Partner-Header lecken (Partner-Admin betreut viele Tenants). Lösung: Branding nur innerhalb von Tenant-Detail- / Impersonation-Scopes anwenden, nicht global.
- **DSGVO / Auftragsverarbeitung**: Partner sehen personenbezogene Daten ihrer Tenants. Es braucht einen Partner-AVV (Vertrag), bevor die Funktion live geht — fachlich, nicht technisch, aber blockierend.
- **Migration bestehender „indirekter" Tenants**: Aktuell gibt es Tenants, die de facto schon von Elektrobetrieben betreut werden, im System aber direkt AICONO zugeordnet sind. Vor Go-Live manueller Mapping-Schritt (Liste pflegen, dann ein `INSERT` in `tenants.partner_id`).
- **Support-Pfad**: Tenant-Support-Anfragen müssen klar gerouted werden — geht der Tenant zu AICONO oder zum Partner? Empfehlung: Pro Tenant Feld `support_owner` (`platform` | `partner`).
- **Berichte und PDF-Footer**: Tagesreports, Rechnungs-PDFs, E-Mail-Footer enthalten heute AICONO-Branding. Falls White-Label später kommt, müssen alle Generatoren (`generateCommunityInvoicePdf`, `generateChargingInvoicePdf`, EnergyReport, etc.) Partner-Branding akzeptieren. Heute nicht ändern, aber Liste führen.
- **HA-Add-on / Gateway**: Gateways sind heute Tenant-gebunden, kein Partner-Bezug. Kein Änderungsbedarf in Stufe 1, aber Partner-Admin sollte Gateway-Status seiner Tenants im Read-Only sehen.

## 7. Vorgeschlagene Reihenfolge (Stufen)

```text
Stufe 1  Schema + RBAC + RLS-Erweiterung (Migrationen 1-5)
Stufe 2  Subdomain-Routing + PartnerLayout + Login-Redirect (Code, ohne Funktion)
Stufe 3  Partner-Dashboard, Tenant-Liste read-only
Stufe 4  Tenant anlegen + Partner-User-Verwaltung + eingeschränkte Impersonation
Stufe 5  Sales Scout im Partner-Kontext (Migration der bestehenden Projekte)
Stufe 6  Abrechnungs-Übersicht (read-only)
Stufe 7  Optional White-Label / Custom Domain (nach Wirtschaftsmodell-Entscheidung)
```

Jede Stufe wird als eigene Migration + eigener Code-PR umgesetzt, damit Rollback möglich bleibt.

## 8. Offene Punkte für deine Entscheidung vor Stufe 1

1. Wirtschaftsmodell — sobald bekannt, beeinflusst es nur Stufe 6/7, nicht das Schema.
2. Dürfen Partner eigene Tenants **anlegen** oder nur **verwalten** (Anlage durch AICONO)?
3. Soll ein bestehender Tenant nachträglich einem Partner zugeordnet werden können (Partner-Wechsel), und wenn ja: nur durch Super-Admin?
4. Soll der Partner Zugriff auf Roh-Energiedaten der Tenants haben oder nur auf aggregierte KPIs?  
  
Antworten und Kommentare:  
1. Wirtschaftsmodell: Info kommt vor Stufe 6 späte  
2. Ja, Partner sollen eigene Tenant anlegen können  
3. Ja, bestehende und zukünftige Tenants sollen von Super-Admin einem Partner zugeteilt werden können. Oder von einem zu einem anderen Partner gewechselt werden können.  
4. Partner soll auch auf Roh-Energiedaten Zugriff haben