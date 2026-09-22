# Ein Login für Partner-Portal und EMS – mit Umschalter

## Ausgangslage (geprüft)

- `h.verst@esb-metelen.de` ist **kein** Partner-Mitglied. Der Account hat die Rolle „Administrator" im Mandanten **ESB GmbH** und sonst nichts.
- Für das Partner-Portal existiert ein **zweiter, separater Account**: `h.verst+partner@esb-metelen.de`, Partner-Admin des Partners, dem der Mandant ESB GmbH zugeordnet ist.
- Heute gilt: Wer Partner-Mitglied ist, wird nach der Anmeldung automatisch ins Partner-Portal geleitet; ein Rücksprung ins EMS gibt es nicht. Das Partner-Portal hat eine eigene Seitenleiste ohne EMS-Einträge.
- Ein Absprung in den EMS eines Kunden existiert bereits als **Support-Sitzung** (in „Meine Tenants", protokolliert, mit Rückkehr).

Antwort auf die Frage: Es passiert nichts Doppeltes – die beiden Anmeldungen sind heute schlicht zwei getrennte Benutzer. Mit derselben Adresse wäre nur eine Anmeldung möglich, und diese würde immer im Partner-Portal landen.

## Ziel

Ein einziger Login für Herrn Verst, der beides kann: kaufmännischer Partner-Bereich und technischer EMS-Bereich des eigenen Mandanten – mit klar sichtbarem Wechsel. Kundenzugriffe bleiben wie bisher über die protokollierte Support-Sitzung.

## Was umgesetzt wird

### 1. Konten zusammenführen
- Die Partner-Mitgliedschaft wird vom Zweitkonto auf `h.verst@esb-metelen.de` übertragen.
- Das Zweitkonto `…+partner@…` wird deaktiviert (nicht gelöscht, damit Zuordnungen in Protokollen erhalten bleiben).
- Die bestehende E-Mail-Sperre bleibt unverändert; ein Konto darf künftig beide Rollen tragen.

### 2. Startseite nach der Anmeldung
- Hat ein Nutzer **beides** (Partner-Mitgliedschaft und eigenen Mandanten), erscheint eine kurze Auswahl: „Partner-Portal (kaufmännisch)" oder „EMS (technisch)".
- Die letzte Wahl wird gemerkt, damit die Auswahl nicht bei jeder Anmeldung stört; über den Umschalter jederzeit änderbar.
- Auf der Partner-Adresse `partner.…` bleibt es beim direkten Start im Partner-Portal.
- Nutzer mit nur einer Rolle merken keine Änderung.

### 3. Umschalter an zwei Stellen
- **Oben im Kopfbereich** beider Bereiche: zwei Schaltflächen „Kaufmännisch / Technisch", der aktive Bereich ist hervorgehoben.
- **Im Benutzermenü unten in der Seitenleiste** zusätzlich ein Eintrag „Zum Partner-Portal" bzw. „Zum EMS".
- Beide erscheinen nur, wenn der Nutzer tatsächlich beide Bereiche nutzen darf.

### 4. Kunden-Mandanten im EMS
- Bleibt wie heute: Aus „Meine Tenants" startet der Partner eine Support-Sitzung in den EMS des Kunden, mit Rückkehr-Banner.
- Die Aktion wird deutlicher platziert (eigene Schaltfläche „EMS öffnen" in Liste und Detailansicht) und auf der Partner-Übersicht als Schnellzugriff ergänzt.

### 5. Trennung bleibt erhalten
- Partner-Portal = kaufmännisch (Mandanten, Abrechnung, Reporting, Gain-Sharing, Branding, Katalog).
- EMS = technisch (Energiedaten, Anlagen, Automation, Ladepunkte).
- Keine Vermischung der Navigationen; nur der Umschalter verbindet sie.

## Technische Details

- `partner_members.user_id` auf `9ead0e48-…` umhängen (Migration/SQL); Zweitkonto per `banned_until` deaktivieren. Der Trigger `guard_partner_member_changes` und die RLS-Policies werden vorher auf Verträglichkeit mit „Partner-Mitglied hat zusätzlich `profiles.tenant_id`" geprüft und, falls nötig, angepasst.
- `src/pages/Index.tsx`: Zeile „Partner-Mitglieder werden ins Partner-Portal geleitet" wird um den Fall „hat zusätzlich Tenant" erweitert → Auswahlseite bzw. gespeicherte Präferenz (`localStorage`).
- Neue Komponente `src/components/common/AreaSwitcher.tsx`, eingebunden in `PartnerLayout`/`PartnerSidebar` und in das EMS-Layout bzw. dessen Seitenleisten-Fußbereich.
- `usePartnerAccess` liefert zusätzlich, ob ein eigener Tenant vorhanden ist, damit der Umschalter korrekt ein-/ausgeblendet wird.
- Support-Sitzung nutzt unverändert `beginImpersonation` / `support-session-*`.
