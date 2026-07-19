# Loxone-Automationen: Umsetzungsplan

## Verifikation gegen offizielle Loxone-Doku

Die Recherche gegen loxone.com/dede/kb bestätigt das Konzept vollständig:


| Behauptung                                                                                    | Status                              | Quelle                                |
| --------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------- |
| Multiplikator-Projekt: eine Datei → Flotten-Deployment via "Miniserver Verwalten"             | ✅ bestätigt                         | kb/multiplikator-projekt              |
| Nur Miniserver / Go / Compact, kein Gen1                                                      | ✅ bestätigt                         | dito                                  |
| Nur eine Miniserver-Variante pro Projekt                                                      | ✅ bestätigt                         | dito                                  |
| Hinzufügen per Netzwerksuche **oder** Remote Connect (externe Adresse)                        | ✅ bestätigt                         | dito                                  |
| Individuelle Bearbeitung, lila Abweichungs-Markierung, pro-Gerät zurücksetzbar                | ✅ bestätigt                         | dito                                  |
| Seiten/Geräte auf Teilmenge beschränkbar                                                      | ✅ bestätigt                         | dito                                  |
| Erst-Login mit bestehenden Credentials, danach Überschreibung durch zentrale User             | ✅ bestätigt                         | dito                                  |
| Seriennummer = MAC ohne Doppelpunkte (OUI `504F94…`)                                          | ✅ bestätigt                         | kb/remote-connect                     |
| WS-API `jdev/sps/io/<uuid>/…` nur read/write auf existierende Objekte, keine Strukturänderung | ✅ bestätigt                         | Communicating-with-the-Miniserver.pdf |
| Remote Connect ohne Portforwarding                                                            | ✅ bestätigt                         | kb/remote-connect                     |
| Failsafe lokal am Miniserver, kein AICONO-Hub vor Ort nötig                                   | ✅ konsistent mit Loxone-Kernprinzip | &nbsp;                                |


**Ein offener Punkt** (Konzept-Abschnitt 3.3): Ob **pro Miniserver individuelle Zugangsdaten** als lila Abweichung vom Grundprogramm dauerhaft bestehen bleiben, ist offiziell nicht dokumentiert. Loxone empfiehlt für flottenübergreifende Benutzerverwaltung stattdessen das **Trust-System** (Zitat KB: „Alle lokalen Benutzer können durch Trust Benutzer ersetzt werden" / „Der Trust Manager darf nicht Teil des Multiplikator-Projekts sein"). Muss vor Rollout praktisch getestet werden.

**Exosphere**: laut KB nur Monitoring/Analytics-Layer, **kein** Ersatz für Multiplikator und **kein** dokumentiertes Credential-/Firmware-Management. Für unseren Zweck nicht relevant.

**Fazit:** Konzept ist technisch tragfähig und funktioniert ohne AICONO-Hardware vor Ort.

---

## Umsetzungsplan

### Phase 0 – Aufräumen im bestehenden Code (halber Tag)

Aktuell verspricht die App Dinge, die es so nicht gibt (XML-Import-Snippets, Discovery ohne installiertes Template):

- **Karte „Loxone-Templates"** auf der Location-Detailseite: reduzieren auf einen **read-only Status-Chip** in der Miniserver-Integrationskachel („12 AICO-Bausteine erkannt · zuletzt vor 3 min").
- **Puzzle-Icon** auf der Miniserver-Kachel bleibt der einzige Auslöser für den Discovery-Scan.
- **Snippet-Pakete-Download / ZIP-Downloads** aus Karte + Super-Admin **entfernen** (funktionieren nicht — es gibt keinen Import-Mechanismus in Loxone Config).
- **Word-Doku** `AICONO_Loxone_Einrichtung_v1.0.docx` als **veraltet** kennzeichnen (nicht löschen, damit bestehende Links nicht brechen — neue Doku ersetzt sie in Phase 4).
- `snippetsCatalog.ts` + `snippetDownload.ts` als deprecated markieren, aber vorerst im Code lassen (Discovery/Registry-Keys werden weiterverwendet).

### Phase 1 – Multiplikator-Projekt aufsetzen (intern, kein Code)

Einmalige, manuelle Arbeit im Loxone Config:

1. Neues Projekt „AICONO_MASTER_Go_v1" anlegen (Miniserver-Variante: **Go**).
2. Alle bereits spezifizierten AICO-Bausteine (`AICO_GridProtect`, `AICO_WindStormProtect`) als **virtuelle Eingänge + Logik** in der Grundprogrammierung anlegen — strikt gemäß Namensschema `AICO_<TemplateKey>__<Instanz>__<Parameter>`.
3. Speichern als Master-Datei im Super-Admin-Storage-Bucket `loxone-master` (Upload-UI existiert bereits: `src/components/super-admin/LoxoneMasterProject.tsx`).
4. **Kritischer Vorab-Test** (offener Punkt 3.3): Auf einem Test-Miniserver einen individuellen User `aicono-worker` mit Gerät-spezifischem Passwort als lila Abweichung setzen, dann Multiplikator erneut deployen und prüfen, ob die Abweichung erhalten bleibt. Falls **nein** → Trust-System evaluieren, bevor produktiv ausgerollt wird.

### Phase 2 – Discovery-Pfad korrekt an LoxAPP3.json ausrichten (1–2 Tage Code)

Bereits weitgehend implementiert, aber verifiziert werden muss:

- `supabase/functions/loxone-template-sync/index.ts`: Discovery liest LoxAPP3.json über den bestehenden Remote-Connect-Resolver (jüngster Fix aus dieser Session), sucht nach Controls, deren Name mit `AICO_` beginnt, parst `<TemplateKey>__<Instanz>__<Parameter>` und schreibt Instanzen + UUIDs nach `location_loxone_templates` (Tabelle existiert).
- Registry-Einträge (`loxone_template_registry`) auf den finalen Satz der Bausteine reduzieren, die tatsächlich im Master-Projekt existieren (aktuell 24 Katalog-Einträge sind Wunschzustand, real gebaut sind erst 2).
- Fehlerfall „keine AICO_-Bausteine gefunden" mit klarer Nutzermeldung: „Auf diesem Miniserver ist noch kein AICONO-Master-Programm installiert. Bitte über die Loxone Config den Miniserver in das Multiplikator-Projekt aufnehmen."

### Phase 3 – Automation-Builder auf real vorhandene Templates begrenzen (1 Tag Code)

`AutomationRuleBuilder.tsx` filtert bereits auf installierte Templates. Ergänzen:

- Wenn für die Location noch keine Template-Instanzen erkannt wurden → Builder zeigt statt „Neu scannen"-Hinweis den **klaren Text**: „Auf diesem Miniserver ist noch kein AICONO-Baustein installiert. Bitte über euren AICONO-Ansprechpartner (bzw. das interne Multiplikator-Projekt) einspielen lassen."
- Kein „Puzzle-Icon" oder „Snippet-Download" mehr vorschlagen — der Kunde kann das nicht selbst installieren.

### Phase 4 – Neue Doku für Laien (halber Tag)

Neue Word-Datei `AICONO_Loxone_Rollout_v2.0.docx` — **interne** Anleitung (nicht für Endkunden), Zielgruppe: unser Techniker / Partner mit Loxone-Config-Kenntnis:

1. Kunden-Miniserver in AICONO anlegen (Integrationen → Loxone Miniserver Go).
2. Seriennummer + aktuelle Zugangsdaten notieren.
3. Multiplikator-Projekt `AICONO_MASTER_Go_v1` in Loxone Config öffnen → „Miniserver Verwalten" → Miniserver manuell per Remote Connect hinzufügen → aktuelle Zugangsdaten eintragen.
4. „In alle Miniserver speichern" → Wartungsfenster ca. 30–60 s pro Gerät (Neustart).
5. In AICONO-App: Location öffnen → auf Miniserver-Kachel „AICO-Bausteine scannen" → sollte alle Instanzen zeigen.
6. Fehlerfälle (falscher User, Miniserver offline, Firmware-Mismatch) + Lösungen.

### Phase 5 – Migration der 3 Bestandskunden (koordiniert, kein reiner Code)

1. Snapshot des jeweiligen Kunden-Projekts sichern.
2. Kunde in das Multiplikator-Projekt aufnehmen; **individuelle Zusatz-Programmierung des Kunden** als lila Abweichung erhalten.
3. Wartungsfenster mit Kunde absprechen (Neustart 20–40 s).
4. Nach Deployment: Discovery-Scan in AICONO, Sichtprüfung der erkannten Bausteine.

### Phase 6 – Fachspezifikation der offenen ~22 Bausteine (extern zu diesem Plan)

Kein Code-Aufwand aus diesem Plan — reine Fachspezifikation, die dann jeweils als zusätzliche Bausteine ins Multiplikator-Projekt einfließen und nach Deployment automatisch von der bestehenden Discovery erkannt werden. Kein weiterer Cloud-Code nötig.

---

## Technische Details

**Betroffene Dateien (Phase 0–3):**

- `src/components/locations/LoxoneTemplatesCard.tsx` — reduzieren oder in Miniserver-Kachel integrieren
- `src/components/integrations/IntegrationCard.tsx` — Status-Chip + Scan-Button (bleibt)
- `src/components/locations/AutomationRuleBuilder.tsx` — Fehlermeldung anpassen
- `src/pages/Integrations.tsx` — Hinweistext („Snippet-Pakete" → weg)
- `src/components/super-admin/LoxoneMasterProject.tsx` — bleibt, ist der richtige Ort
- `src/lib/loxone/snippetsCatalog.ts`, `src/lib/loxone/snippetDownload.ts` — als deprecated markieren
- `supabase/functions/loxone-template-sync/index.ts` — Fehlermeldungen präzisieren, ansonsten unverändert
- `docs/loxone-ws-worker/index.ts` — **unverändert** (Worker ist produktiv und korrekt)

**Was nicht geändert wird:**

- DB-Schema (`location_loxone_templates`, `loxone_template_registry`) bleibt.
- Worker-Code, Remote-Connect-Auflösung, WebSocket-Auth bleiben.
- Super-Admin `LoxoneMasterProject`-Upload bleibt (ist genau der richtige Ort für die Multiplikator-Datei).

## Aufwand

- Phase 0–3 (Code): **2–3 Tage**
- Phase 1 (Master-Projekt bauen in Loxone Config): **0,5–1 Tag** — nicht Lovable
- Phase 4 (Doku): **0,5 Tag**
- Phase 5 (Migration Bestandskunden): pro Kunde **~30 min** + Wartungsfenster
- Phase 6 (22 Bausteine spezifizieren): extern, nicht Teil dieses Plans

## Voraussetzungen vor Umsetzung

1. **Test von Punkt 3.3** durch dich (individuelle User als Abweichung): entscheidet, ob wir mit Multiplikator-User arbeiten oder Trust-System dazu nehmen müssen.
2. Freigabe, dass Snippet-Download/XML-Doku aus der App entfernt werden darf.

Sobald das geklärt ist, kann Phase 0–3 direkt umgesetzt werden.  
  
Antwort: Wir arbeiten mit Multiplikator-User. Bitte jetzt den Plan so umsetzen