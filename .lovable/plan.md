

## Expertenbewertung -- Umsetzungsplan

Herzlichen Glückwunsch zur hervorragenden Bewertung! Hier meine Einschätzung zu den fünf Punkten:

---

### 1. DSGVO: Datenschutzerklärung & Impressum

**Status:** Fehlt komplett. Der Cookie-Banner existiert bereits, verlinkt aber nirgendwohin.

**Umsetzung:**
- Zwei neue Seiten erstellen: `/datenschutz` und `/impressum`
- Beide als öffentliche Routen (ohne Login) in `App.tsx` registrieren
- Inhalte als statische React-Komponenten mit Platzhaltertexten, die ihr rechtlich anpassen müsst (Anwalt empfohlen)
- Links im Cookie-Banner, im Footer der Auth-Seite und ggf. in der Sidebar ergänzen

**Aufwand:** Gering -- rein Frontend, kein Backend nötig.

---

### 2. `.env`-Datei im Repository

**Status:** Die `.env` enthält `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` und `VITE_SUPABASE_PROJECT_ID`. Die `.gitignore` enthält **keinen** Eintrag für `.env`.

**Einschätzung:** Diese drei Werte sind **öffentliche/publishable Keys** -- sie sind bewusst im Frontend-Bundle sichtbar (der Anon-Key ist kein Secret, Supabase sichert via RLS). Das ist branchenüblich und kein Sicherheitsrisiko.

**Trotzdem Best Practice:**
- `.env` in `.gitignore` aufnehmen (wird bei Lovable Cloud automatisch generiert)
- Dies verhindert, dass bei späteren Erweiterungen versehentlich echte Secrets committed werden

**Aufwand:** Eine Zeile in `.gitignore`.

---

### 3. Deployment-Pipeline für Hetzner

**Status:** Aktuell deployt Lovable Cloud automatisch. Für Self-Hosting auf Hetzner braucht ihr eine eigene CI/CD-Pipeline.

**Einschätzung:** Das ist ein **Infrastruktur-Thema außerhalb von Lovable**. Lovable kann den Code über GitHub synchronisieren, von dort aus könnt ihr eine Pipeline bauen.

**Empfohlener Ansatz:**
- GitHub-Repo ist bereits verbunden (oder kann verbunden werden)
- GitHub Actions Workflow erstellen: Build → Docker Image → Push to Registry → Deploy auf Hetzner
- Der Docker Compose Stack (Supabase Self-Hosted + Nginx Frontend + Gateway Worker) ist in der Developer-Dokumentation bereits beschrieben

**Was ich hier tun kann:** Eine `Dockerfile` fürs Frontend und eine beispielhafte `docker-compose.yml` erstellen. Die eigentliche CI/CD-Pipeline (GitHub Actions YAML) kann ich ebenfalls als Vorlage liefern.

**Aufwand:** Mittel -- hauptsächlich DevOps-Arbeit außerhalb von Lovable.

---

### 4. Monitoring (Grafana/Kibana)

**Status:** Kein Monitoring vorhanden.

**Einschätzung:** Das ist ein **reines Infrastruktur-Thema** für den Hetzner-Stack. Grafana und Kibana laufen als zusätzliche Container im Docker Compose Setup.

**Was ich hier tun kann:**
- Die `docker-compose.yml`-Vorlage um Grafana, Prometheus und Loki (oder ELK-Stack) erweitern
- Einen Health-Check-Endpoint als Edge Function erstellen, den Prometheus abfragen kann
- Frontend: Ein einfaches Status-Dashboard im Super-Admin-Bereich (optional)

**Aufwand:** Gering für die Vorlagen, die eigentliche Einrichtung erfolgt auf dem Server.

---

### 5. Automatisierte Tests

**Status:** Es gibt 4 Unit-Tests für Hooks (`useAuth`, `useEnergyData`, `useMeters`, `useTenantQuery`) plus einen Platzhalter-Test. Die Test-Infrastruktur (Vitest + React Testing Library) steht.

**Einschätzung:** Die Testabdeckung ist tatsächlich dünn. Gerade bei KI-gestützter Codegenerierung sind Tests als "Sicherheitsnetz" für die Business-Logik essenziell.

**Priorisierte Test-Strategie:**
1. **Business-Logik Utilities** (höchste Priorität): `costCalculations.ts`, `co2Calculations.ts`, `formatEnergy.ts`, `csvParser.ts`, `sepaXml.ts` -- reine Funktionen, einfach zu testen
2. **Kritische Hooks**: `useTenant`, `useModuleGuard`, `useUserRole`, `useDashboardFilter` -- Tenant-Isolation und Zugriffssteuerung
3. **Edge Function Integration Tests**: Die Edge Functions (`gateway-ingest`, `invite-tenant-admin`, `delete-user`) per `supabase--test-edge-functions` testen
4. **Komponenten-Tests** (nachgelagert): Formulare mit Validierungslogik (z.B. `AddMeterDialog`, `InviteUserDialog`)

**Aufwand:** Hoch -- sollte iterativ erfolgen, ca. 20-30 Testdateien für solide Abdeckung.

---

### Zusammenfassung & Empfehlung

| Punkt | Prio | In Lovable umsetzbar? | Aufwand |
|---|---|---|---|
| Datenschutz & Impressum | Hoch | Ja, komplett | Klein |
| `.env` in `.gitignore` | Hoch | Ja, 1 Zeile | Minimal |
| Hetzner Deployment | Mittel | Teilweise (Dockerfile, Vorlagen) | Mittel |
| Monitoring | Niedrig | Teilweise (Vorlagen) | Mittel |
| Automatisierte Tests | Hoch | Ja, komplett | Groß (iterativ) |

**Mein Vorschlag:** Wir starten mit Punkt 1 und 2 (schnelle Wins vor Produktivstart), dann Punkt 5 iterativ. Punkte 3 und 4 sind Infrastruktur-Aufgaben für euer DevOps-Team.

Soll ich mit der Umsetzung beginnen?

