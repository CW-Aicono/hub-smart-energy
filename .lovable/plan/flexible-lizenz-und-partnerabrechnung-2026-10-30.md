# Flexible Lizenz- und Partnerabrechnung

## Ziel
Je verkauftem Modul oder Lizenz wird **einmalig, monatlich, quartalsweise oder halbjährlich** abgerechnet. Partner erstellen ihre Endkundenrechnungen in AICONO; AICONO stellt dem Partner separat dessen Einkaufskosten in Rechnung.

**Festgelegte Regeln:** Automatisch entstehen ausschließlich Entwürfe zur Freigabe. Neue Verkäufe werden zeitanteilig ergänzt. Bereits ausgestellte Rechnungen bleiben unverändert. Die genannten 8 € / 6 € sind ein Beispiel, keine neuen Katalogpreise.

## 1. Verkauf und Abrechnungstakt
- Im Portal und beim Partner erhält der Verkauf eines Moduls/Pakets oder einer Ladepunktlizenz ein Auswahlfeld für den Abrechnungstakt sowie Menge, Beginn und Verkaufspreis.
- Monatliche Katalogpreise bleiben die Preisbasis: ein Quartal umfasst drei, ein Halbjahr sechs Monate; einmalige Leistungen werden genau einmal berechnet.
- Wiederkehrende Zeiträume orientieren sich an Kalendermonaten, Kalenderquartalen beziehungsweise Kalenderhalbjahren. Bei Beginn innerhalb eines Zeitraums wird jeder betroffene Monat tagesgenau anteilig berechnet.
- Einkaufspreise stammen ausschließlich aus dem zentralen Katalog; Partner setzen ihren Endkunden-Verkaufspreis. Die vereinbarten Preise werden beim Verkauf gespeichert.
- Aktive Ladepunktlizenzen werden als abrechenbare Mengen geführt. Zusätzliche verkaufte Lizenzen lösen zeitanteilige Ergänzungen aus; Geräte-Heartbeats gelten nicht als Verkauf.
- Bestehende Kunden, Altpreise, Paketbuchungen und Rabatte bleiben unverändert. Keine automatische Umstellung vorhandener Verträge.

## 2. Zwei getrennte Rechnungswege
**Partner → Endkunde:** Entwurf mit Verkaufspreis, Kunde, Leistungszeitraum, Menge und Partner als Rechnungsabsender.

**AICONO → Partner:** Separater Entwurf zum Einkaufspreis mit nachvollziehbarer Zuordnung zu Kunde und Lizenzverkauf. Endkunden erhalten keinen Einblick in Einkaufspreise.

- Ein bestätigter Verkauf registriert beide Rechnungswege automatisch; fehlgeschlagene Verarbeitung bleibt sichtbar und wiederholbar.
- Neue Kunden oder zusätzliche Lizenzen erzeugen Ergänzungsentwürfe, statt festgeschriebene Rechnungen zu verändern.
- Reguläre Partner-Einkaufsentwürfe bündeln die fälligen Positionen je Partner und Abrechnungszeitraum; Ergänzungen behalten einen eigenen Vorgangsbezug.
- Jeder Verkauf und Abrechnungszeitraum erhält eine eindeutige Zuordnung, damit Wiederholungen keine Doppelrechnungen erzeugen.
- Ein Ergebnis von 0 € wird als Abo-Beleg geführt, nicht als buchbare Rechnung.

## 3. Partnerrechnungen bearbeiten und freigeben
- Unter **Partner → Abrechnung** erscheinen Verträge/Lizenzen, Endkundenrechnungen und AICONO-Einkaufsrechnungen getrennt.
- Partner-Admins pflegen Rechnungsabsender, rechtliche Angaben, Bankverbindung, Logo, Zahlungsziel und Nummernpräfix.
- Freigabe vergibt eine fortlaufende, partnerbezogene Rechnungsnummer; danach sind Inhalt und Absender-/Empfängerdaten unveränderlich gespeichert.
- PDF-Download und bewusster E-Mail-Versand verwenden das Partnerbranding. Versand über die vorhandene verifizierte Versandadresse mit Partnername und geprüfter Antwortadresse; keine ungeprüften Absenderdomains.
- Rechnungsstellung beziehungsweise SEPA wird je Vertrag geführt. Entwürfe lösen weder Versand noch Lastschrift aus. SEPA-Export setzt Freigabe und gültiges Mandat voraus; eine tatsächliche Bankabbuchung wird dadurch nicht behauptet.

## 4. Sicherheit und bestehende Abrechnung
- Partner dürfen ausschließlich ihre eigenen Kunden verkaufen und abrechnen; Berechtigungen und Portfolio werden serverseitig geprüft.
- Technische Modulfreigabe bleibt beim bestehenden autorisierten Freigabeweg. Ein bloßer technischer Zugriff und ein bestätigter kostenpflichtiger Verkauf werden nicht verwechselt.
- Der bisherige Monatslauf berechnet neu vertraglich erfasste Positionen nicht zusätzlich. Nicht umgestellte Leistungen und Support bleiben auf ihrem bisherigen Weg.
- Partner-Endkundenrechnungen gelangen nicht in die AICONO-Lexware-Sammelübertragung oder den AICONO-SEPA-Export.
- Keine ausgestellten Rechnungen werden geändert, gelöscht oder neu nummeriert.

## Technische Umsetzung
- Additive, idempotente Migrationen über das Migrationstool: Verkaufs-/Vertragsdaten mit Intervall, Preisstand, Menge und Abrechnungsfortschritt; separate Partner-Endkundenrechnungen, Partnerabsender und Nummernkreise.
- Bestehende AICONO-Rechnungen bleiben in ihrer bisherigen Struktur; neue Einkaufsentwürfe nutzen eindeutige `source_ref`-Zuordnungen.
- Verkauf, Periodenabrechnung und Nummernvergabe erfolgen transaktional mit Sperren, Wiederholungsschutz, Eingabevalidierung, expliziten GRANTs und mandanten-/partnerbezogenen RLS-Regeln.
- Integration in bestehende Modul-/Paket-Verkaufswege; keine zweite ungeschützte Möglichkeit zur Modulfreigabe.
- Sofortige Entwürfe bei Verkauf; ein täglicher gemeinsamer Lauf erzeugt fällige Folgeentwürfe und holt versäumte Termine nach. Folgeentwürfe können damit bis zu 24 Stunden nach Periodenbeginn erscheinen, ohne dauerhaft häufige Prüfungen.
- Migrationen werden vom bestehenden Deploy für Cloud und Live berücksichtigt; Funktionen und vorhandene Deploy-Verpackung werden zusammen aktualisiert.

## Prüfung und Abschluss
- Konkrete Tests für alle vier Intervalle, Tagesanteile einschließlich Monats-/Jahreswechsel, frei gewählte Verkaufspreise und katalogbasierte Einkaufspreise.
- Tests für zwei Kunden desselben Partners, zusätzliche Ladepunktlizenzen, wiederholte Verkaufsanforderungen und nachgeholte Abrechnungszeiträume.
- Datenbanktests für Partner-/Mandantentrennung, Preismanipulation, doppelte Entwürfe, unveränderliche ausgestellte Rechnungen und 0-€-Belege.
- Angemeldete Browserprüfung: Verkauf → zwei getrennte Entwürfe → Partnerfreigabe → gebrandeter PDF-Download; kein ungefragter Testversand und keine ungefragte echte Lastschrift.
- Bestehende Monats-, Paket-, Legacy-, Lexware- und SEPA-Wege gezielt auf Regressionen prüfen.
- Version, Changelog, Release Notes, Hilfe-Versionshistorie, Benutzerhandbuch in DE/EN/ES/NL und Roadmap aktualisieren.

## Nicht Bestandteil
Keine automatische Freigabe oder Zustellung, keine automatische Preisänderung für Bestandskunden und keine neue Bank-/Zahlungsanbieterintegration. Livebetrieb wird erst nach Deploy geprüft; Partner müssen ihre rechtlichen Rechnungsabsenderdaten vervollständigen.