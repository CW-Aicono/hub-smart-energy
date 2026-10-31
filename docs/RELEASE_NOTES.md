# Versionshinweise

## v1.27.0 – 31.10.2026
- Abrechnung im AICONO Portal und im Partnerportal klarer gegliedert: Rechnungen, Verträge und Rabatte in eigenen Reitern; Rechnungen an Partner und an Direktkunden getrennt filterbar.

## v1.26.2 – 31.10.2026
- Partnerportal: Abrechnungsseite übersichtlicher mit drei Reitern – Übersicht, Verkäufe & Rechnungen, Preise & Margen.

## v1.26.1 – 31.10.2026
- Partnerportal Branding: Farbauswahl funktioniert wieder, mit Vorschau und Formatprüfung.

## v1.26.0 – 31.10.2026
- Vertragslaufzeit je Paketvertrag in Monaten wählbar, mit automatischer Verlängerung oder automatischem Ende; später änderbar durch AICONO und Partner.

## v1.25.1 – 31.10.2026
- Partnerportal: „Rabatt bei AICONO anfragen“ ist unter Abrechnung eingeklappt und öffnet per Klick.

## v1.25.0 – 31.10.2026
- Partner verkaufen Pakete jetzt an genau einer Stelle: beim Endkunden im Reiter „Pakete & Verkauf“.
- AICONO sieht je Kunde, was der Partner verkauft hat und wie viele Ladepunkte neu dazugekommen sind.

## v1.23.0 – 31.10.2026
- Portal: Pakete werden Partnern jetzt als ganze Pakete freigeschaltet. Partner können ihren Kunden nur freigeschaltete Pakete verkaufen.

## v1.22.0 – 31.10.2026
- Portal: Kundenseite zeigt statt „Module“ und „Lizenz“ jetzt den Reiter „Pakete“; Zahlungsart und SEPA stehen unter „Abrechnung“.

## v1.21.5 – 30.10.2026
- Portal: „Module & Bundles“ heißt jetzt „Modulpreise (Altverträge)“.

## v1.21.4 – 30.10.2026
- Portal: Der Menüpunkt „Lizenzen“ entfällt – Verträge werden über Pakete gebucht.

## v1.21.3 – 30.10.2026
- Partnerportal: Ladeinfrastruktur hat beim Tenant wieder eine eigene Karte zum Freischalten; abgerechnet wird je Ladepunkt.

## v1.21.2 – 30.10.2026
- Partnerportal: Unter „Module & Lizenzen“ stehen jetzt die Pakete im Vordergrund; alte Einzelmodule erscheinen nur noch bei Altverträgen in einem einklappbaren Bereich.

## v1.21.0 – 30.10.2026
- Einstellungen → „Paket & Rechnungen“ für Kunden-Admins: gebuchte Pakete mit enthaltenen Funktionen (ohne Preise), nicht freigeschaltete Funktionen mit Hinweis „Im Paket X enthalten – Anfrage an Partner/AICONO“ und alle ausgestellten Rechnungen an den Kunden (von AICONO oder vom Partner) als PDF mit E-Rechnung. Normale Benutzer sehen den Bereich nicht.
- Abnahmetests der Paketabrechnung (Fälle A, B, C, Flatrate, Neukunde, anteilig, Mengenänderung, Support-Prüfung, Paket 6) als automatische Tests hinterlegt.

## v1.20.0 – 30.10.2026
- Partner-Portal → Abrechnung: Die Preisliste zeigt jetzt Pakete und Mengenpreise mit Einkauf (EK), empfohlenem Verkaufspreis (UVP), eigenem Verkaufspreis und Marge, getrennt für Kommunen und Industrie. Die alte Modulpreisliste erscheint nur noch für Kunden mit Altvertrag.
- „Rabatt bei AICONO anfragen“: Auswahl von Paketen, Mengenpreisen und Remote-Support-Flatrate statt Einzelmodulen. Freigegebene Rabatte mindern den EK der gewählten Positionen.
- Margen je Tenant werden für Paketkunden aus der Monatsübersicht berechnet (inkl. Rabatte, eigene Verkaufspreise je Segment).
- Provisions-Partner sehen die erwartete Provision je Tenant und ihre Provisionsgutschriften.
- Übersicht: Die Kachel „Offene Abrechnung“ zeigt die Summe der offenen AICONO-Einkaufsrechnungen.

## v1.19.0 – 30.10.2026
- Rechnungsflüsse nach Partnermodell: Direktkunden zur UVP; Wiederverkaufs-Partner erhalten eine Sammelrechnung je Monat zum EK, gegliedert nach Kunde (inkl. Einrichtung im Aktivierungsmonat); Provisions-Partner erhalten eine monatliche Provisionsgutschrift, der Kunde wird zur UVP abgerechnet.
- Partner erhalten je Kunde automatisch einen Endkunden-Entwurf mit eigenen Preisen und können eigene Positionen ergänzen; AICONO sieht diese Rechnungen nicht.
- Warnung beim Generieren, wenn ein offener Direktentwurf an einen Kunden eines Wiederverkaufs-Partners besteht; Eigenbedarf des Partners wird „An Partner“ gekennzeichnet.
- Korrektur freigegebener Rechnungen nur noch per Storno-Rechnung mit Bezug auf das Original (AICONO und Partner).
- Alle Rechnungs-PDFs enthalten eine E-Rechnung (ZUGFeRD, EN 16931); Leitweg-ID je Kunde für Behörden.
- Lexware: Rechnungen werden weiter als Entwurf übertragen und dort abgeschlossen; die Liste zeigt ehrlich „In Lexware (Entwurf)“.

## v1.18.0 – 30.10.2026
- Monatsübersicht nach Paketen berechnet für umgestellte Kunden UVP und EK je Position und ist dort Grundlage der Monatsrechnung („Positionen“ aufklappbar).
- Mengen werden automatisch gezählt (täglicher Zähllauf): Ladepunkte mit mindestens einem aktiven Tag, Liegenschaften, abgerechnete Ladevorgänge, Pakete taggenau anteilig, Remote-Support, Support je 15 Min., Einrichtung im Aktivierungsmonat.
- Support-Sitzungen über 4 Stunden oder ohne Ende werden nicht automatisch berechnet, sondern als „Prüfen“ markiert.
- Freigegebene Partnerrabatte mindern den EK; Summen je Partner und für Direktkunden.
- Neue Spalte „Änderung zum Vormonat“; Mengenänderungen über 50 % markieren den Entwurf gelb. Nachträgliche Mengen werden im nächsten Lauf nachberechnet.
- Partner sehen Mengenänderungen ihrer Kunden einmal täglich gesammelt unter Abrechnung.
- Neue Kunden werden ab Anlage nach Paketen abgerechnet; Bestandskunden bleiben unverändert.

## v1.17.0 – 30.10.2026
- „Paket buchen“ belegt den Preis automatisch aus der Preisliste vor (Direktkunde UVP, Partnerkunde EK); abweichende Preise nur mit Begründung, gekennzeichnet als „individueller Preis“.
- Neu buchbar: „Einrichtung (einmalig)“. Ladepunkte und weitere Liegenschaften werden nicht mehr manuell gebucht, sondern automatisch gezählt.
- Voraussetzungen werden geprüft (Pakete 2/3/5 nur mit Paket 1, Paket 6 nur mit weiterem Paket oder Ladepunkten); ab 7 Liegenschaften Hinweis auf Paket 6.
- Kündigen eines Pakets schaltet nur Module ab, die kein anderes Paket abdeckt und die nicht einzeln freigeschaltet sind.
- Neuer Schalter „Abrechnung nach Paketen“ je Kunde mit Paketvorschlag; gilt ab dem Folgemonat, Modulpreise werden danach nur angezeigt.

## v1.16.3 – 30.10.2026
- Preisstammdaten aktualisiert: Ladepunkt 8 € / Partner 6 € pro Monat, Remote-Support-Flatrate 149 € / Partner 112 € – jetzt auch für Partner buchbar.
- Preisänderungen werden mit Gültig-ab-Datum versioniert und automatisch protokolliert; bereits erzeugte Rechnungen bleiben unverändert.
- Die bisherigen Bundles sind als „Altvertrag – nicht mehr buchbar“ gekennzeichnet; Kunden mit bestehender Buchung werden unverändert weiter abgerechnet.

## v1.16.2 – 30.10.2026
- Fernstart eines Ladevorgangs ist jetzt auch möglich, wenn das Fahrzeug bereits angesteckt ist (Status „Vorbereitung“).
- Im OCPP-Protokoll werden reine Hersteller-Statusmeldungen (z. B. ELMI 0x0B0B0000) nicht mehr als Fehler markiert.

## v1.16.1 – 30.10.2026
- Alle OCPP-Ladestatus getrennt dargestellt, insbesondere Vorbereitung, Fahrzeug-/Stationspause, Beendet und Reserviert. Offene Sitzungen überschreiben gemeldete Zustände nicht; Statusanzeige in Listen, Details, Karten, Widgets und Lade-App vereinheitlicht.

## v1.16.0 – 30.10.2026
- Neue Buchungen und Rechnungsauswahl bieten Pakete und Zusatzleistungen statt einzelner Module/Lizenzen.
- Ladeinfrastruktur: 8 € netto pro Ladepunkt und Monat für neue Verkäufe; bestehende Verträge und Preise bleiben unverändert.
- Remote-Support-Flatrate für direkte Kunden; ohne Partnerpreis nicht im Partnerverkauf verfügbar.

## v1.15.0 – 30.10.2026
- Lizenzverkauf: Abrechnung je Modul/Paket oder Mengenlizenz einmalig, monatlich, quartalsweise oder halbjährlich; neue Verkäufe zeitanteilig als Entwurf.
- Partner-Endkundenrechnungen mit eigenen Absenderdaten, Nummernkreis, PDF, bewusster E-Mail-Freigabe und SEPA-Export. AICONO-Einkaufsentwürfe bleiben getrennt.
- Täglicher Abrechnungslauf holt fällige Zeiträume nach; bestehende Verträge werden nicht automatisch umgestellt.

## v1.14.0 – 29.10.2026
- Rechnungen im AICONO-GmbH-Branding: PDF mit allen Pflichtangaben, fortlaufender Rechnungsnummer und ausgewiesener Umsatzsteuer, Versand per E-Mail direkt aus dem Portal.
- Neu: freie Rechnungen mit eigenen Positionen an Kunden oder Partner; Absenderdaten unter „Rechnungsabsender“ pflegbar.
- Festgeschriebene Rechnungen sind unveränderlich, Korrektur nur per Storno. Lexware-Übertragung nur noch auf Wunsch je Rechnung.

## v1.13.2 – 29.10.2026
- Gebäudekomplex: Etagen und Grundrisse direkt unter jedem Gebäude aufklappbar.
- Bisherige Komplex-Etagen liegen im umbenennbaren Platzhalter „Gebäude 1 (bitte umbenennen)“; neue Komplexe erhalten ihn automatisch.
- Neu „Umbauen / Korrigieren“: Etage in Gebäude umwandeln, Etage verschieben, Gebäude in Etage umwandeln – Grundrisse, Räume und Zähler wandern mit.

## v1.13.1 – 28.10.2026
- Live und Staging angeglichen: Anleitungen für Mennekes AMTRON 4Business und ELMI All-in-One unter Ladeinfrastruktur → Einstellungen; bestehende Ladepunkte erscheinen als Zähler unter Messstellen.

## v1.13.0 – 28.10.2026
- Gebäudekomplex: Gebäude direkt auf der Komplex-Seite hinzufügen, zuordnen oder lösen.
- Neu: Kostenverteilung je Raum / Abteilung (eigener Zähler + Rest nach Fläche, gleichen Teilen oder ungeteilt), Summen je Ebene, Gebäude und Komplex, Export als CSV/PDF.

## v1.12.2 – 28.10.2026
- Behoben: Die Energieanalyse zeigt wieder Werte, auch wenn auf dem Server eine Auswertung fehlt.
- Einladungs- und Passwort-Links (seit v1.11.1) werden beim Update zuverlässig aktiv.

## v1.12.1 – 26.10.2026
- Behoben: Eigene Rollen wie „Endkunde“ sehen nur noch die freigegebenen Bereiche und können das Dashboard nur mit dem entsprechenden Recht anpassen.
- Tacho- und Kennzahl-Kacheln im Dashboard aktualisieren sich jetzt alle 15 Sekunden.

## v1.12.0 – 20.10.2026
- Neu: ELMI All-in-One (Schnellladestation mit Batteriespeicher) als Vorlage. Der Speicher lädt PV-Überschuss über den Loxone Miniserver; einstellbar, ob Auto oder Speicher zuerst lädt.
- Entladen ins Netz ist gesperrt; Entladen für den eigenen Verbrauch kann freigegeben werden.
- Handbuch: Schritt-für-Schritt-Anleitung für den Loxone Miniserver.

## v1.11.2 – 20.10.2026
- Gas- und Wasserzähler mit Impulsgeber zeigen unter „Aktuelle Werte“ jetzt den echten mittleren Durchfluss statt springender Werte.
- Zählerdialog weist darauf hin, wenn ein Gas-/Wasserzähler vermutlich ein Impulszähler ist und der Schalter noch fehlt.

## v1.11.1 – 14.10.2026
- Einladungs- und „Passwort vergessen“-Links funktionieren jetzt zuverlässig 7 Tage – auch wenn das Firmen-Postfach Links vorab automatisch prüft.
- Neu: „Startpasswort vergeben“ (Schlüssel-Symbol) in den Benutzerlisten. Der Nutzer meldet sich damit an und muss danach ein eigenes Passwort festlegen.

## v1.11.0 – 13.10.2026
- Live-Leistungen (z. B. Shelly) im Dashboard werden bei geöffneter Seite alle 10 Sekunden aktualisiert.
- Dashboard: neue Kachelbreiten 1/6, 1/4 und 3/4; neue Kachel „Ladestationen (Detail)“ mit Leistung, Status, Verbindung, Zählerstand und laufendem Ladevorgang je Ladepunkt.
- Energieanalyse: gewählte Auflösung wird immer eingehalten, neu „15 Minuten“; Jahreslastgang im 15-Minuten-Raster als CSV exportierbar.
- Meldung „Sensor nicht gefunden“ erscheint erst bei dauerhaft fehlendem Sensor, nennt den Zählernamen und verschwindet automatisch, wenn der Sensor wieder da ist.

## v1.10.0 – 13.10.2026
- Ladepunkte erscheinen automatisch als Stromzähler im Energiemonitoring (Kennzeichnung „Ladepunkt“) mit Live-Leistung, Zählerstand, Verlauf, Widgets, Export, Alarmen und Kosten. Vorhandene Messwerte der Ladestationen wurden übernommen.

## v1.9.0 – 09.10.2026
- Rechnungen entstehen automatisch als Entwurf: Einrichtungsgebühr bei neuen Kunden, anteiliger erster Monat bei Paketbuchung, Freischaltgebühr bei Partner-Freischaltung. Freigabe an Lexware weiterhin per Button.
- Partnerkunden mit Paketen werden an den Partner zum Einkaufspreis berechnet; Endkunden sehen diese Rechnungen nicht.
- Rechnungsübersicht: Filter Monatlich / Einmalig / An Partner.
- An Lexware übergebene Rechnungen enthalten jetzt alle Positionen inkl. Rabatte und Ladepunkte.
- Einrichtungsassistent: „Abbrechen“ führt jetzt zuverlässig ins Dashboard, statt den Assistenten erneut zu öffnen.

## v1.8.1 – 09.10.2026
- Aktive Lizenzen und Gain-Sharing haben eigene Symbole. Modulpreise und Bundles stehen gemeinsam unter „Module & Bundles“ mit zwei Reitern und unterschiedlichen Symbolen.

## v1.8.0 – 09.10.2026
- Neue Paketpreise (Basis + 6 Pakete) mit unverbindlicher Preisempfehlung und Partner-Einkaufspreis.
- Angebotsrechner mit Paketen, Liegenschaften, Ladepunkten und Ladevorgängen; Rabatt auf UVP und Aufschlag auf EK; Warnung unter EK.
- Pakete je Kunde buchen; Monatsübersicht je Partner. Bestehende Kunden behalten ihre Module und Preise.

## v1.7.2 – 08.10.2026
- Passwort direkt im Profil ändern (aktuelles und neues Passwort), ohne Umweg über E-Mail.
- Links in Passwort-E-Mails führen immer auf die richtige AICONO-Adresse.
- Passwörter aus bekannten Datenlecks werden abgelehnt; neue Passwörter brauchen mind. 8 Zeichen mit Buchstabe und Ziffer.

## v1.7.1 – 07.10.2026
- Portal-Rollen: Übersicht aller Teammitglieder mit Rollen, Status und letztem Login; Rollen per „Rollen bearbeiten“ anpassen. Der letzte Portal-Admin ist jetzt auch serverseitig geschützt.
- Portal-Rollen: Änderungsprotokoll zeigt, wer wann welche Rolle vergeben oder entzogen hat.

## v1.7.0 – 07.10.2026
- AICONO Portal → Rollen: Spalte „Admin“ in der Portal-Benutzerliste; Admins vergeben/entziehen Admin, Kaufmännisch und Technisch. Selbstentzug und Entzug des letzten Admins gesperrt.
- Partner-Rabatt-Anfragen: Partner-Admins fragen unter Partner-Portal → Abrechnung Rabatte für ein oder mehrere Module an (ein Kunde oder alle Kunden). AICONO Portal → Abrechnung: Freigabe ganz/teilweise oder Ablehnung mit Notiz; Freigabe legt Kundenrabatte an.

## v1.6.9
- Einladungslinks sind robuster: Der Link bleibt gültig, bis das Passwort wirklich gespeichert wurde. Doppelklicks oder Abbrüche machen ihn nicht mehr kaputt. Verständliche Hinweise, wenn ein Link bereits verwendet oder abgelaufen ist.
- „Einladung erneut senden“ im AICONO Portal unter Benutzer.
- „Profil & Passwort“ ist jetzt auch im AICONO Portal und im Partner-Portal erreichbar.

## v1.6.8
- Unter Ladeinfrastruktur → Abrechnung gibt es jetzt einen Button „CSV-Export“ für Ladevorgänge und Rechnungen. Exportiert werden alle Einträge des gewählten Zeitraums und der Suche – direkt in Excel lesbar.

## v1.6.7
- Fallen Messwerte von Shelly-Zählern zeitweise aus (z. B. Internet- oder Serverausfall), werden die Lücken jetzt stündlich automatisch aus der Shelly Cloud nachgeladen. Nachgeladene Abschnitte zeigen den Stundenmittelwert.

## v1.6.6
- Dashboard-Widgets: Die gewählte Einheit (z. B. Watt oder Kilowatt) wird jetzt immer zuverlässig angewendet – auch nach einem Neuladen der Seite. Werte werden korrekt umgerechnet und im deutschen Zahlenformat angezeigt.

## v1.6.5
- Shelly-Messwerte bleiben im Tagesverlauf erhalten, auch wenn niemand eingeloggt ist.
- Weniger Abfragen bei Shelly verhindern wechselnde „Sync-Fehler“-Hinweise.
- Tacho und Kennzahl zeigen bei Leistung den aktuellen Wert; Verläufe in Watt werden korrekt dargestellt.

## v1.6.4
- Partner-Portal zeigt die Module der Kunden wieder korrekt; im AICONO Portal freigegebene Partner-Module bleiben nach erneutem Öffnen erhalten.

## v1.6.3
- Dashboard-Grafiken zeigen jetzt deutlich an, wenn ein Zähler keine gespeicherten Werte liefert.
- Portal-Admins können Module eines Kunden direkt freischalten.
- Das Änderungsprotokoll der Remote-Sitzungen wird nach dem Update auch auf Live angezeigt.

## Oktober 2026
- **v1.6.2:** Die Portal-Benutzerliste zeigt wieder Benutzer und ihre Partner-Zugehörigkeit. Einheitliche Bezeichnungen: Portal-Admin, Partner-Admin und Kunden-Admin; Zugriffsrechte bleiben unverändert.
- **v1.6.1:** Die Roadmap ist nur noch im Testsystem sichtbar und hat den Status „Wartet auf Nutzer“. Benutzer, die einziger Partner-Admin waren, lassen sich wieder löschen.
- **v1.6.0 – AICONO Portal:** Der Portal-Admin-Bereich heißt jetzt AICONO Portal und ist übersichtlich in Übersicht, Kaufmännisch, Technisch und Verwaltung gegliedert. Mitarbeiter erhalten gezielt die Rolle Kaufmännisch oder Technisch und sehen nur ihre Bereiche.
- **v1.5.0 – Einheitspreise & Abo-Belege:** Alle Kunden zahlen denselben Modulpreis; Nachlässe gibt es über Rabatte und Promotionen. Ergibt eine Monatsabrechnung 0 €, wird keine Rechnung erstellt, sondern ein Abo-Beleg, der nicht an die Buchhaltung geht.
- **v1.4.2 – Rollen sauber getrennt:** In einem Mandanten werden Personen jetzt „entfernt“ statt gelöscht; Konto und weitere Rollen bleiben erhalten. „EMS öffnen“ öffnet den eigenen Mandanten direkt. Modul-Schalter für Partner reagieren sofort und melden Fehler.
- **v1.4.1 – Zähler-Verknüpfung:** Datengateway und Sensor eines Geräts bleiben nach dem Speichern zuverlässig erhalten, sodass wieder Messwerte ankommen. Der irreführende Hinweis „Keine Zähler angelegt“ erscheint nicht mehr, wenn Gateway-Zähler vorhanden sind.
- **v1.4.0 – Ladeleistung & Lastgang:** Neues Dashboard-Feld zeigt die aktuelle Ladeleistung jedes Ladepunkts (einblenden über „Im Dashboard anzeigen“ unter Ladeinfrastruktur). In der Energieanalyse lässt sich der Jahreslastgang in 15-Minuten-Werten als Excel exportieren. Bei Geräten kann der Sensor neu gewählt werden, alte Integrationen lassen sich löschen, nach einer Remote-Sitzung kehren Sie in Ihren Ausgangsbereich zurück, und Partner-Module lassen sich wieder speichern.
- **v1.3.2 – Korrekturen:** Im Remote-Verlauf werden die Änderungen der Support-Sitzung wieder angezeigt. Die Ladepunkt-Übersicht zeigt nicht mehr „Belegt“, wenn die Wallbox „frei“ meldet. Hängengebliebene Ladevorgänge ohne Energie werden automatisch abgeschlossen.
- **v1.3.1 – Remote & Einladungen:** Ist „Remote-Zugriff erlauben“ ausgeschaltet, kann sich niemand mehr per Remote einwählen; beim Ausschalten wird eine laufende Sitzung sofort beendet. Angemeldete Nutzer erscheinen nicht mehr zusätzlich als offene Einladung.
- **v1.3.0 – Ladepunkte & Rabatte überarbeitet:** Der Preis je aktivem Ladepunkt steht jetzt als Unterpunkt unter „Ladeinfrastruktur“. Rabatte vergeben Sie direkt in der Modulzeile des Kunden – auch für Bundles, mit Laufzeit in Monaten oder Jahren, monatlich, per Vorkasse oder als Einmalzahlung.
- **v1.2.1 – Einladungen repariert:** Bereits registrierte Personen (z. B. ein Mitarbeiter eines Kunden) können wieder zusätzlich als Partner-User oder Admin eingeladen werden.
- **v1.2.0 – Ladepunkt-Gebühr:** Module können pauschal, pro aktivem Ladepunkt oder beides abgerechnet werden. Eine Vorschau zeigt, wie viele Ladepunkte aktiv sind und was das aktuell kostet.
- **Rabatte:** Für jedes Modul lassen sich Rabatte in Prozent oder Euro vergeben – dauerhaft oder befristet, z. B. 3 Monate Startpreis. Partner können das für ihre Kunden selbst tun.
- **Klare Versionsnummern:** Die Version heißt jetzt z. B. „v1.1.0“ (Major = große Umstellung, Minor = neue Funktionen, Patch = Fehlerbehebung). Die technische Build-Kennung steht nur noch im Hintergrund.
- **Benutzerhandbuch aktualisiert:** Neues Kapitel „Konto, Rollen & Support“ sowie Ergänzungen zu Energieanalyse und Ladepunkten.
- **Versionsanzeige synchron:** Unter Hilfe & Support sehen Sie oben rechts jetzt dieselbe Versionsnummer wie in der Seitenleiste; der Versionsverlauf enthält den neuen Eintrag v1.1.0.
- **Firmenname geschützt:** Den Firmennamen ändern nur Administratoren des Mandanten, Partner-Admins oder AICONO-Portal-Admins.
- **Strengere Rechteprüfung:** Mandanten-Zuordnung und E-Mail eines Kontos ändern nur noch AICONO-Portal-Admins; E-Mail-Vorlagen bearbeiten nur Administratoren.
- **Gesperrt heißt jetzt wirklich gesperrt:** Gesperrte Benutzer können sich nicht mehr anmelden und werden aus laufenden Sitzungen abgemeldet.
- **Bereichswechsel immer oben rechts:** Der Umschalter Portal-Admin / Kaufmännisch / Technisch sitzt jetzt in allen Bereichen an derselben Stelle – in einer eigenen schmalen Kopfleiste, sodass er keine Seiteninhalte mehr verdeckt.
- **Portal-Admin-Verwaltung ohne Konsole:** Portal-Admin-Rollen lassen sich unter Rollen & Rechte entziehen, Plattform-Benutzer unter Benutzer löschen – jeweils mit Sicherheitsabfrage. Der letzte Portal-Admin ist geschützt.
- **Jede Grafik mit eigenem Zeitraum:** Im Dashboard ändert der Zeitraum nur noch die jeweilige Grafik und bleibt gespeichert.
- **Neue Energieanalyse:** Unter Energiedaten → Energieanalyse vergleichen Sie beliebige Messstellen, Zeiträume (z. B. Vorjahr), sehen Heatmap und Dauerlinie, beziehen Werte auf m² oder Wetter und exportieren nach CSV/Excel. Mit „Link kopieren“ teilen Sie die Analyse mit Kollegen.
- **Ladestatus korrigiert sich selbst:** Neue Fernfunktion „Status abfragen“. Zeigt eine Ladestation länger als 2 Stunden „Lädt“, obwohl kein Ladevorgang läuft, fragt das System den echten Status automatisch neu ab.
- **Schneller Bereichswechsel:** Wer mehrere Rollen hat, wechselt mit einem Klick zwischen Portal-Admin, Partner-Portal und eigenem Energie-Dashboard.
- **Immer aktuell:** Im Benutzermenü und im Profil sehen Sie die App-Version. Gibt es eine neue Version, erscheint oben „Jetzt aktualisieren“ – kein Strg+F5 mehr nötig.
- **Fernwartung ohne Zeitdruck und nachvollziehbar:** Eine Remote-Sitzung läuft, bis sie beendet wird. Unter Hilfe → Remote-Support sehen Sie jetzt, wann und wie lange eine Sitzung stattfand und was dabei geändert wurde. Schalten Sie Remote-Support aus, endet eine laufende Sitzung sofort.
- **Ein Konto, mehrere Rollen:** Mit derselben E-Mail-Adresse können Sie Mandant, Partner und Administrator sein und oben links zwischen „Kaufmännisch" und „Technisch" wechseln.
- **Module für Ihre Kunden freigeben:** Partner können ihren Kunden jetzt selbst Module ein- und ausschalten – im Rahmen der für sie lizenzierten Module.
- **Bessere Lesbarkeit:** Der Bereichs-Umschalter ist deutlicher, und der Hinweis bei einer Fernwartung verdeckt keine Knöpfe mehr.
- **Klarere Meldungen:** Fehler bei Einladungen nennen jetzt den genauen Grund.

## September 2026
- „Passwort vergessen?" sitzt jetzt direkt unter dem Anmelde-Knopf.
- Neue Ladesäulen-Vorlage: Mennekes AMTRON 4Business 760.
- Gesamtübersicht aller Ladepunkte, Unterstützung für Impulszähler, einheitliche Einheiten (kWh, m³).
