# Staging und Live angleichen (v1.13.1)

## Befund (Staging geprüft)
- Die Anleitung „Mennekes Amtron 4 Business" ist die einzige Anleitung auf Staging – sie wurde damals direkt in die Datenbank geschrieben, nicht als Änderungsdatei. Deshalb fehlt sie auf Live.
- ELMI ist auf Staging als Ladestations-Modell (All-in-One 180/360) vorhanden, aber ohne eigene Anleitung. Die Vorlagen-Suche zeigt nur Anleitungen – deshalb „Keine Ladestationen gefunden", auch wenn das Modell auf Live existieren sollte.
- Ladepunkt-Zähler: Die Änderungsdatei richtet nur die Automatik für neue/geänderte Ladepunkte ein. Bestehende Ladepunkte (ESB, Steinfurt) wurden auf Staging per Hand nachgezogen – auf Live fehlt dieser Nachlauf.

## Umsetzung
1. **Kurzer Live-Check vorab** (Copy-Paste-Befehl im Chat): Sind 0035/0037 auf Live eingetragen, gibt es ELMI-Modelle, wie viele Ladepunkt-Zähler existieren.
2. **Neue Änderungsdatei 0041 (wiederholbar, ohne Duplikate):**
   - Anleitung Mennekes Amtron 4 Business 1:1 von Staging übernehmen.
   - Neue Anleitung „ELMI Power All-in-One" (OCPP-Anbindung + Verweis auf Loxone/Modbus-Speicherteil), verknüpft mit dem ELMI-Modell.
   - ELMI-Modelle zur Sicherheit nochmals anlegen, falls sie fehlen.
   - Nachlauf: für alle bestehenden Ladepunkte mit Liegenschaft und ohne Zähler automatisch einen Zähler anlegen (gleiche Regeln wie die Automatik, nichts doppelt).
3. **GitHub-Ablauf:** Node 20 → 24 und aktuelle Aktions-Versionen; Ubuntu fest auf 24.04, damit der Wechsel auf Ubuntu 26 nichts überraschend ändert.
4. **Abweichungen künftig verhindern:**
   - Neue Regel in den Projektregeln: Stammdaten (Anleitungen, Vorlagen, Modelle, Nachläufe) nur noch über Änderungsdateien, nie direkt.
   - Deploy-Abschlussprüfung: nach dem Einspielen werden Anzahl Anleitungen, ELMI-Modelle und Ladepunkte ohne Zähler im Deploy-Protokoll ausgegeben.
5. Changelog, Release Notes, Versionsverlauf, Handbuch (4 Sprachen, ELMI-Anleitung), Roadmap pflegen; Version 1.13.1.

## Technische Details
- `drizzle/migrations/0041_seed_ocpp_guides_and_cp_meter_backfill.sql`: `INSERT ... WHERE NOT EXISTS (vendor, model)` für Guides/charger_models; Backfill per `INSERT INTO meters ... SELECT FROM charge_points WHERE linked_meter_id IS NULL AND location_id IS NOT NULL AND NOT EXISTS meter mit source_charge_point_id`, danach `UPDATE charge_points SET linked_meter_id`.
- `.github/workflows/deploy-prod.yml`: `node-version: '24'`, `actions/checkout@v5`, `setup-node@v5`, Docker-Actions aktuelle Major, `runs-on: ubuntu-24.04`.
- `scripts/deploy.sh`: lesende Abschluss-Abfrage nach `apply-migrations.sh`.
- Regel in `AGENTS.md` ergänzen.
