# Rollen-System, Umschalter, Remote-Banner und Änderungsprotokoll

## Bereits erledigt (nur prüfen, nicht neu bauen)
- Arbeitsbereich ist auf dem aktuellen Staging-Stand (Partner-Portal ist vollständig vorhanden).
- Die Einladungssperre ist aufgehoben: Wer schon einen Login hat, wird mit der gewählten Rolle als Partner-Mitglied verknüpft. Bei Fehlern erscheint der konkrete Grund.
- Der Umschalter ist für Nutzer mit mehreren Rollen eingebaut.

## 1. Umschalter besser sichtbar machen
- Der Knopf, der gerade nicht aktiv ist, bekommt eine deutlich lesbare Schrift und ein Symbol mit Kontrast. Bisher verschwindet „Kaufmännisch“ fast im Hintergrund.
- Der aktive Bereich wird klar hervorgehoben. Der ganze Umschalter bekommt einen kräftigen Rahmen.
- In der schmalen Seitenleiste werden beide Hälften gleich breit, damit keine leere Fläche mehr entsteht.
- Beide Bereiche werden im hellen und im dunklen Design geprüft.

## 2. Rotes Remote-Banner verdeckt Knöpfe
- Das Banner wird nicht mehr über den Inhalt gelegt. Es steht als eigene Zeile oben und schiebt den Inhalt darunter nach unten. Damit verdeckt es keine Knöpfe mehr.
- Die Prüfung erfolgt auf dem Dashboard und auf Seiten mit Knöpfen oben rechts.

## 3. Neue Grundregel: Folgen prüfen
- Die Regel kommt dauerhaft in das Projektgedächtnis: Vor jeder Änderung wird geprüft, was davon betroffen ist und was kaputtgehen kann. Nach dem Bau wird geprüft, ob alles noch funktioniert. Das umfasst die Fehlerprotokolle und einen Test der betroffenen Abläufe.

## 4. Module über alle Ebenen weitergeben (Super-Admin → Partner → Mandant)
- Jeder Partner bekommt eine eigene Liste der Module, die für ihn freigeschaltet sind. Der Super-Admin pflegt diese Liste in der Partner-Detailansicht.
- In der Mandanten-Ansicht des Partner-Portals erscheint eine Modulverwaltung. Der Partner kann dort nur Module ein- und ausschalten, die er selbst hat. Alle anderen Module sind ausgegraut und mit einem Hinweis versehen.
- Diese Grenze wird zusätzlich auf dem Server geprüft und nicht nur in der Oberfläche. Ein Partner kann also nur seine eigenen Mandanten bearbeiten und nur seine eigenen Module vergeben.
- Für Partner, die es schon gibt, wird die Liste einmal mit den Modulen gefüllt, die ihre Mandanten heute schon nutzen. So geht nichts verloren.
- Der Super-Admin kann weiterhin alles freischalten.

## 5. Christian Wattenberg wieder als Super-Admin (Live-System)
Diesen Befehl auf dem Hetzner-Server ausführen. Hendrik Verst behält seine Rolle.
```text
cd /opt/hub-smart-energy
docker exec -i supabase-db psql -U postgres -d postgres -c "INSERT INTO public.user_roles (user_id, role) SELECT id, 'super_admin' FROM auth.users WHERE email='christian.wattenberg@aicono.de' ON CONFLICT (user_id, role) DO NOTHING;"
```

## 6. Änderungsprotokoll und Versionshinweise
Bisher gibt es beides nicht, deshalb wird es neu eingeführt:
- Ein Änderungsprotokoll für das Team, nach Datum und Version sortiert und mit Rückblick auf die letzten Wochen.
- Leicht verständliche Versionshinweise für Kunden.
- Ab jetzt werden beide bei jeder Änderung fortgeschrieben.

## Prüfung nach dem Bau
- Fehlerprotokoll muss sauber sein.
- Umschalter und Banner werden per Bildschirmfoto kontrolliert.
- Eine Partner-Modulfreigabe wird mit einem erlaubten und einem nicht erlaubten Modul getestet.

## Technische Details
- Die Komponente `AreaSwitcher.tsx` arbeitet mit Design-Tokens und `flex-1`-Buttons. Inaktive Knöpfe nutzen `text-foreground/80` statt `text-muted-foreground`.
- Die Banner-Komponente (Support-Ansicht, `src/lib/supportView.ts` und Einbindung im Layout) wird von `fixed/absolute` auf einen `sticky` Block im normalen Seitenfluss umgestellt.
- Neue Tabelle `partner_modules (partner_id, module_key)` mit GRANTs und RLS: Super-Admin darf alles, Partner-Mitglieder dürfen ihre eigenen Einträge lesen. Dazu kommt die Edge Function `partner-set-tenant-module`, die prüft, ob der Mandant zum Partner gehört und ob das Modul im Partner-Portfolio ist. Die Liste wird einmal aus den aktiven Mandanten-Modulen befüllt.
- Neue Dateien: `CHANGELOG.md` und `docs/RELEASE_NOTES.md`. Die Pflegeregel kommt in `AGENTS.md`.
