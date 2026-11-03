# PV-Überschuss → Ladestation → Speicher: sichtbar und prüfbar machen

## Was die Prüfung ergeben hat
- **Energiefluss im ESB-Tenant:** Das Dashboard zeigt nur „Strom → Zentrale ESB 143,82 kWh". Das ist eine Tagessumme ohne PV, Netz, Speicher oder Ladepunkte, daher nicht aussagekräftig. Die Ursache (Zuordnung der Zähler oder Widget-Logik) wird in Schritt 1 geklärt, nicht geraten.
- **Takt:** Die PV-Überschussregelung läuft auf Staging tatsächlich **alle 5 Minuten**, nicht alle 2 Minuten (meine frühere Angabe war falsch).
- **Ohne Speicher:** Technisch ist der Speicher schon optional, nötig ist nur ein Bezugszähler. In der Oberfläche ist das aber nicht klar erkennbar.
- **ELMI:** Ladestation und Speicher sind ein Gerät. Die Regelung behandelt den Speicher getrennt, der Speicheranteil beim Laden wird nicht berücksichtigt.

## Ist 2 bzw. 5 Minuten üblich?
- Üblich sind **10–60 Sekunden**. Wolken ändern die PV-Leistung innerhalb von Sekunden. Mit 5 Minuten wird oft Netzstrom bezogen oder PV ungenutzt eingespeist.
- Vorschlag: Die schnelle Regelung läuft lokal (Gateway oder Loxone, 10–15 s). Die Cloud gibt nur Vorgaben vor und prüft alle 1 Minute. Ein häufigerer Cloud-Takt würde die Kosten erhöhen und hängt von verzögerten Messwerten ab.

## Umsetzung in 5 Schritten

### 1. Energieflussmonitor reparieren (ESB)
- Bei ESB klären, warum nur „Strom" erscheint: Rolle der Zähler (PV, Netz, Speicher, Ladepunkte) und Sichtbarkeit des Widgets.
- Zähler-Rollen pro Liegenschaft sauber zuordnen. Es kommt ein Hinweis „Zähler fehlen", statt eines leeren oder irreführenden Bildes.

### 2. Einstellungen PV-Überschussladen klarer machen
- Zwei Modi deutlich wählbar: **„Nur Zähler"** (ohne Speicher) und **„Mit Speicher"** (Priorität Fahrzeug oder Speicher).
- **ELMI-Modus:** Ist Ladestation = Speichergerät, wird der Speicher beim Laden automatisch als Quelle mitgerechnet. So wird ein Entladen des Speichers nicht als PV-Überschuss gewertet.
- Prüfanzeige direkt in den Einstellungen: Bezugszähler liefert Daten (Alter des letzten Werts), Vorzeichen der Einspeisung plausibel, Ladepunkte im PV-Modus, Speicher erreichbar.

### 3. Interaktive Live-Energiefluss-Grafik (neue Ansicht)
- Knoten: PV, Netz, Gebäude, Speicher (mit Ladestand), je Ladepunkt.
- Bewegte Linien. Die Richtung zeigt den Fluss, die Dicke die Leistung, die Farbe die Quelle (PV grün).
- Klick auf einen Knoten: aktuelle Werte, Zeitpunkt der letzten Messung, verknüpfter Zähler.
- Aktualisierung etwa alle 15 s. Veraltete Werte werden ausgegraut markiert.

### 4. Regelentscheidung nachvollziehen (statt Simulationstaste)
- Es wird nichts simuliert. Jede echte Regelentscheidung wird gespeichert und angezeigt: gemessener Überschuss, Sicherheitspuffer, Anteil Speicher, Zuteilung je Ladepunkt, Ergebnis (laden oder pausieren) und Grund.
- Eine animierte Schritt-Grafik zeigt die Entscheidung: Überschuss → minus Puffer → Speicher → Ladepunkte. Die letzten Entscheidungen lassen sich durchblättern.

### 5. Analyse-Diagramm
- Zeitverlauf übereinander: PV-Erzeugung, Netzbezug/Einspeisung, Ladeleistung, Speicher laden/entladen und Ladestand.
- Kennzahlen: PV-Anteil am Laden, Netzbezug während PV-Laden, verschenkter Überschuss.
- Regelentscheidungen erscheinen als Markierungen im Diagramm.

## Reihenfolge und Versionen
1. Schritt 1 + 2 (Fehler beheben, Grundlage) – v1.39.0
2. Schritt 3 (Live-Grafik) – v1.40.0
3. Schritt 4 + 5 (Entscheidung + Analyse) – v1.41.0
4. Jeweils Handbuch in 4 Sprachen, Versionshinweise, Roadmap, Tests der Regelrechnung, angemeldete Prüfung bei ESB.

## Offene Fragen an euch
- Soll die Cloud-Regelung auf 1 Minute verkürzt werden (höhere Kosten), oder bleibt es bei 5 Minuten, bis die lokale Regelung steht?
- ELMI: Darf der Speicher beim Laden immer entladen werden, oder nur bis zu einem Mindest-Ladestand (z. B. 20 %)?

## Technische Details
- Scheduler `solar-charging-scheduler`: Cron `1-59/5`. Der Speicherabzug wirkt nur bei `storage_first`. ELMI-Kopplung über `energy_storages` ↔ Ladepunkt ergänzen. Neue Spalten werden über eine Migration hinzugefügt (z. B. `storage_mode`, `min_soc_for_ev`).
- Entscheidungsprotokoll: bestehendes `logExecution` um Detailfelder erweitern (jsonb `decision`). Aufräumen nach 30 Tagen.
- Live-Grafik: SVG + CSS-Animation, Daten aus `meter_power_readings_5min` / den neuesten Rohwerten. Mandantenfilter `tenant_id`, Zahlen im deutschen Format.
- Energieflussmonitor: Rollenauflösung in `EnergyFlowMonitor.tsx` prüfen und korrigieren. Bestehende Widgets anderer Tenants bleiben unverändert.
- Live (Hetzner) erst nach dem nächsten Deploy. Migrationen idempotent, in die Release-Prüfung aufnehmen.
