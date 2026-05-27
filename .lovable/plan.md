## Ziel
Iteration B abschließen — Phase 1 vollständig.
Punkte aus Gap-Analyse: **2 Mitglieder-Lifecycle**, **5 PLZ-Check Edge Function**, **6 MaLo/MeLo-Validierung**, **7 Mitglieder-Detailseite**, **8 Community-Dashboard**.

---

## 1. Status-Machine (Punkt 2)

**DB-Migration** (nur Code-seitig, kein Daten-Update):
- `community_members.status` Standardwert auf `"invited"` setzen.
- Neue Spalten:
  - `invited_at TIMESTAMPTZ`
  - `activated_at TIMESTAMPTZ`
  - `suspended_at TIMESTAMPTZ`
  - `last_invite_sent_at TIMESTAMPTZ`
- Erlaubte Status-Werte (Doku, kein Enum für Flexibilität): `invited`, `pending_idents`, `pending_msb`, `active`, `suspended`, `left`.
- Trigger `trg_member_status_timestamps` setzt automatisch das passende Zeitfeld bei Statuswechsel.

**Hook-Erweiterung** `useEnergyCommunities.tsx`:
- `useCommunityMembers` bekommt zusätzliche Mutation `setMemberStatus(id, newStatus)`.
- `createMember` setzt Default-Status `"invited"` + `invited_at = now()`.
- `SignContractDialog` bleibt unverändert (setzt bereits `active`).

---

## 2. PLZ-Check Edge Function (Punkt 5)

`supabase/functions/community-plz-check/index.ts`:
- POST `{ plz: string }`
- Open-Data: PLZ → VNB-Mapping. **Cheapest path**: Lokales JSON-Mapping der häufigsten ca. 30 deutschen VNBs nach PLZ-Präfix (3-stellig), eingebettet als `const PLZ_VNB_MAP`. Falls keine Übereinstimmung: Fallback `{ vnb: null, hint: "Bitte VNB manuell ergänzen" }`.
- CORS + Zod-Validierung (PLZ = 5 stellige Ziffern).
- Antwort: `{ plz, vnb, region, fallback: boolean }`.
- **Begründung Mini-Mapping**: Echte BNetzA-API ist nicht öffentlich + kostenfrei. User kann das Mapping später erweitern. Spart Setup-Kosten.

**Verwendung im Wizard**: PLZ-Schritt zeigt nach Eingabe die ermittelte(n) VNB(s) inline an (kein Block).

---

## 3. MaLo/MeLo-Validierung (Punkt 6)

`src/lib/energy-sharing/idValidation.ts`:
- `isValidMaLo(id)`: 11-stellig numerisch, Modulo-11-Prüfziffer nach BDEW-Spezifikation.
- `isValidMeLo(id)`: 33-stellig alphanumerisch, Präfix `DE`, definierter Aufbau.
- Reine Frontend-Validierung mit klaren Fehlermeldungen.

**Einbindung**:
- `MembersTab` Dialog: Inline-Fehler unter MaLo-Feld bei Eingabe; Speichern blockiert, wenn ungültig.
- Neuer „MeLo-ID"-Input im selben Dialog.

---

## 4. Mitglieder-Detailseite (Punkt 7)

Neue Route `/energy-sharing/members/:memberId`:
- Datei `src/pages/EnergySharingMemberDetail.tsx`.
- Lazy-Import in `App.tsx`, ebenfalls `ModuleGuard` für `energy_sharing`.
- Inhalt:
  - Header: Name, Status-Badge, Status-Wechsel-Dropdown (mit Hinweis: nur valide Transitionen).
  - Karte „Stammdaten": E-Mail, Rolle, MaLo, MeLo, Anteil kW, joined_at, member_no.
  - Karte „Vertrag": letzte Signatur (Datum, IP, Hash) — aus `community_member_signatures` lesen; Button „Erneut unterzeichnen lassen" öffnet `SignContractDialog`.
  - Karte „Onboarding-Timeline": invited_at → activated_at → ggf. suspended_at/left_at.
  - „Zurück"-Link auf `/energy-sharing`.
- Hook-Update: `useCommunityMembers` zusätzlich `useCommunityMember(memberId)` einzelner Datensatz inkl. Community-Referenz.
- In `MembersTab` jede Tabellenzeile → Klick auf Name navigiert zur Detailseite.

---

## 5. Community-Dashboard (Punkt 8)

Neuer Tab „Dashboard" in `EnergySharing.tsx` (vor „Übersicht" oder als erster Tab):
- Datei `src/components/energy-sharing/CommunityDashboardTab.tsx`.
- KPI-Cards (deutsche Zahlen-Formatierung verpflichtend):
  - Aktive Mitglieder (Status=active) / Gesamt
  - Installierte Leistung (Σ capacity_kw)
  - Gesicherter Anteil (Σ share_kw der aktiven)
  - Anzahl unterzeichneter Verträge (distinct member_id in `community_member_signatures`)
- Status-Verteilungsdiagramm: Recharts `PieChart` (Wiederverwendung vorhandener Chart-Patterns aus `src/components/dashboard/`).
- Onboarding-Funnel: einfacher horizontaler Bar-Chart (invited → active).
- **Out of scope** für Iteration B: Energieflüsse (MSCONS noch nicht produktiv) — kommt mit Iteration C.

---

## 6. i18n
Keine neuen Translation-Keys — Tab/Karten-Labels bleiben DE-only in dieser Iteration (analog zum bestehenden EnergySharing-Code). Konsistent mit aktuellem Stand.

---

## Datei-Übersicht
**Neu:**
- `supabase/functions/community-plz-check/index.ts`
- `src/lib/energy-sharing/idValidation.ts`
- `src/pages/EnergySharingMemberDetail.tsx`
- `src/components/energy-sharing/CommunityDashboardTab.tsx`
- 1 Migration (Spalten + Trigger)

**Geändert:**
- `src/hooks/useEnergyCommunities.tsx` (neue Mutationen, neuer Hook `useCommunityMember`)
- `src/components/energy-sharing/CommunityWizard.tsx` (PLZ-Check-Aufruf)
- `src/pages/EnergySharing.tsx` (Dashboard-Tab, MeLo-Feld, Validierung, Zeilen-Klick)
- `src/App.tsx` (neue Route)
- `src/hooks/useModuleGuard.tsx` (Mapping `/energy-sharing/members` → `energy_sharing`)
- `.lovable/plan.md`

## Nicht im Scope
- Echte E-Mail-Einladungen via `send-transactional-email` (Trigger erst, wenn Mailing-Stack final entschieden ist → Iteration C).
- MSCONS-Daten, Allokation, Billing → Iteration C.
- Marktplatz/PWA → Iteration D.

## Verifikation
- Migration läuft fehlerfrei.
- Wizard PLZ-Feld zeigt VNB-Treffer/Fallback.
- Mitglied anlegen mit ungültiger MaLo → blockiert.
- Klick auf Mitglied → Detailseite öffnet, Statuswechsel funktioniert, Timeline zeigt Daten.
- Dashboard-Tab zeigt KPIs und Pie-Chart korrekt mit `toLocaleString("de-DE")`.
