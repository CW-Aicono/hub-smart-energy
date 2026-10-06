# Versionshinweise

## Oktober 2026
- **v1.6.1:** Die Roadmap ist nur noch im Testsystem sichtbar und hat den Status „Wartet auf Nutzer“. Benutzer, die einziger Partner-Admin waren, lassen sich wieder löschen.
- **v1.6.0 – AICONO Portal:** Der Super-Admin-Bereich heißt jetzt AICONO Portal und ist übersichtlich in Übersicht, Kaufmännisch, Technisch und Verwaltung gegliedert. Mitarbeiter erhalten gezielt die Rolle Kaufmännisch oder Technisch und sehen nur ihre Bereiche.
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
- **Firmenname geschützt:** Den Firmennamen ändern nur Administratoren des Mandanten, Partner-Admins oder AICONO-Super-Admins.
- **Strengere Rechteprüfung:** Mandanten-Zuordnung und E-Mail eines Kontos ändern nur noch AICONO-Super-Admins; E-Mail-Vorlagen bearbeiten nur Administratoren.
- **Gesperrt heißt jetzt wirklich gesperrt:** Gesperrte Benutzer können sich nicht mehr anmelden und werden aus laufenden Sitzungen abgemeldet.
- **Bereichswechsel immer oben rechts:** Der Umschalter Super-Admin / Kaufmännisch / Technisch sitzt jetzt in allen Bereichen an derselben Stelle – in einer eigenen schmalen Kopfleiste, sodass er keine Seiteninhalte mehr verdeckt.
- **Super-Admin-Verwaltung ohne Konsole:** Super-Admin-Rollen lassen sich unter Rollen & Rechte entziehen, Plattform-Benutzer unter Benutzer löschen – jeweils mit Sicherheitsabfrage. Der letzte Super-Admin ist geschützt.
- **Jede Grafik mit eigenem Zeitraum:** Im Dashboard ändert der Zeitraum nur noch die jeweilige Grafik und bleibt gespeichert.
- **Neue Energieanalyse:** Unter Energiedaten → Energieanalyse vergleichen Sie beliebige Messstellen, Zeiträume (z. B. Vorjahr), sehen Heatmap und Dauerlinie, beziehen Werte auf m² oder Wetter und exportieren nach CSV/Excel. Mit „Link kopieren“ teilen Sie die Analyse mit Kollegen.
- **Ladestatus korrigiert sich selbst:** Neue Fernfunktion „Status abfragen“. Zeigt eine Ladestation länger als 2 Stunden „Lädt“, obwohl kein Ladevorgang läuft, fragt das System den echten Status automatisch neu ab.
- **Schneller Bereichswechsel:** Wer mehrere Rollen hat, wechselt mit einem Klick zwischen Super-Admin, Partner-Portal und eigenem Energie-Dashboard.
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
