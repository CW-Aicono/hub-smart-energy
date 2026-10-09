# Versionshinweise

## Unveröffentlicht
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
