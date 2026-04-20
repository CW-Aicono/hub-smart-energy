# Neue Version live schalten

Wenn du deine Änderungen in Lovable gemacht hast und sie auf der Live-Seite
(**ems.aicono.org**) sehen willst, folge dieser Anleitung.

---

## Vorher: Prüfe in Lovable

Öffne die Lovable-Vorschau und schau dir die App an. Klick durch, teste, was du
geändert hast. Nur was du hier siehst, wird gleich live gehen.

Wenn alles gut aussieht – weiter zu Schritt 1.

---

## Schritt 1: GitHub öffnen

Öffne diese Seite in deinem Browser:

<https://github.com/CW-Aicono/hub-smart-energy/actions/workflows/deploy-prod.yml>

Du musst bei GitHub eingeloggt sein. Wenn nicht: oben rechts auf **Sign in** klicken.

---

## Schritt 2: Deploy starten

Auf der Seite siehst du rechts einen grauen Knopf: **"Run workflow"**.

1. Klicke auf **Run workflow** (rechts, grauer Button, mit Pfeil-Symbol).
2. Ein kleines Fenster klappt auf.
3. Lass das Branch-Dropdown auf `main` stehen.
4. In das Feld **"Gib 'LIVE' ein, um Prod-Deploy zu bestätigen"** tippst du:
   ```
   LIVE
   ```
   (genau so, in Großbuchstaben)
5. Klick auf den grünen Button **Run workflow**.

---

## Schritt 3: Warten

Nach ein paar Sekunden erscheint oben in der Liste ein neuer Eintrag mit einem
orangen Kreis. Das bedeutet: der Deploy läuft.

Es dauert etwa **2 bis 4 Minuten**.

- **Grünes Häkchen** ✓ = Alles gut, neue Version ist live auf ems.aicono.org
- **Rotes Kreuz** ✗ = Deploy hat nicht geklappt. Die alte Version läuft weiter.
  Bitte **David kontaktieren**.

---

## Schritt 4: Auf der Live-Seite prüfen

Öffne <https://ems.aicono.org/> und schau, ob deine Änderung da ist.

Wenn der Browser die alte Version zeigt: **Strg+F5** (Windows) oder **Cmd+Shift+R**
(Mac) drücken, um den Cache zu leeren.

---

## Was, wenn es schiefgeht?

**Rotes Kreuz bei GitHub:** Das System hat automatisch die alte Version
zurückgeholt. Die Live-Seite läuft weiter wie vorher. David sieht das und
kümmert sich darum.

**Live-Seite ist kaputt trotz grünem Häkchen:** Sofort David anrufen/schreiben.
Er kann die letzte funktionierende Version in weniger als einer Minute zurückholen.

---

## FAQ

**F: Muss ich irgendetwas mit Git machen?**
Nein. Lovable macht das automatisch. Du klickst nur den Knopf.

**F: Kann ich mehrere Änderungen auf einmal live schalten?**
Ja. Alles, was seit dem letzten Klick in Lovable passiert ist, geht in einem
Rutsch live.

**F: Was, wenn ich den Knopf aus Versehen klicke?**
Kein Problem, solange du nicht "LIVE" eingetippt hast. Ohne das Wort bricht
der Deploy sofort ab.

**F: Kann ich einen Deploy rückgängig machen?**
Nicht selbst. Schreib David – er kann das in einer Minute erledigen.
