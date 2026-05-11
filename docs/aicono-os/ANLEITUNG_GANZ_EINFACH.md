# AICONO Hub OS – Die Klick-für-Klick-Anleitung

> **Für absolute Anfänger.** Du musst **nichts** wissen über GitHub, Code,
> Programmierung oder Workflows. Du klickst nur das, was hier steht.
> **Dauer:** ca. 15 Minuten.

---

## Was machst du hier eigentlich?

Stell dir GitHub wie eine Dropbox für Programmcode vor.
Wir müssen dort **einen leeren Ordner** anlegen, damit unser System
automatisch Dateien hineinschicken kann. Mehr nicht.

Du machst nur **3 Dinge**:

1. **Einen leeren Ordner auf GitHub anlegen** (Klicks im Browser)
2. **Warten, bis sich die Dateien von alleine hineinkopieren** (passiert automatisch)
3. **Einen Knopf drücken, der das Image baut** (1 Klick)

Das war's. Los geht's.

---

# TEIL 1: Den leeren Ordner auf GitHub anlegen

## 1.1 Browser öffnen und einloggen

1. Öffne deinen Browser (Chrome, Safari, Firefox – egal).
2. Gib oben in die Adresszeile ein: **github.com**
3. Drücke Enter.
4. Oben rechts ist ein Knopf **„Sign in"** – klicke ihn an.
5. Logge dich mit deinem GitHub-Konto ein
   (Email + Passwort, das du bei GitHub hast).

> ❓ **Du hast kein GitHub-Konto?** Dann oben rechts auf **„Sign up"** klicken
> und kostenlos eines erstellen. Email + Passwort reichen.

---

## 1.2 Zur Organisation „CW-Aicono" gehen

1. Du bist eingeloggt. Oben rechts ist dein **kleines Profilbild** (Kreis).
2. Klicke auf das Profilbild.
3. Ein Menü klappt auf. Klicke auf **„Your organizations"**.
4. Du siehst eine Liste. Klicke auf **„CW-Aicono"**.

> ❓ **„CW-Aicono" ist nicht in der Liste?**
> Dann fehlt dir die Einladung. Schreib dem Team:
> *„Bitte ladet mich zur Organisation CW-Aicono auf GitHub ein,
> mein Username ist: ……"*
> Dann hier weitermachen.

---

## 1.3 Den leeren Ordner („Repository") anlegen

Du bist jetzt auf der Seite der Organisation. Da steht oben groß **CW-Aicono**.

1. Suche oben einen **grünen Knopf** mit der Aufschrift **„New"**
   (oder „New repository"). Klicke ihn an.
2. Eine neue Seite öffnet sich. Du musst nur **3 Sachen** ausfüllen,
   den Rest **lass komplett in Ruhe**:

   **Feld „Repository name":**
   Tippe genau ein:
   ```
   aicono-os
   ```
   (klein geschrieben, mit Bindestrich, ohne Leerzeichen)

   **Sichtbarkeit – Auswahl unten:**
   - Punkt setzen bei **„Private"** (empfohlen, damit nur ihr es seht)

   **Häkchen-Bereich „Initialize this repository with":**
   - **WICHTIG: Setze KEIN einziges Häkchen!**
   - Lass „Add a README file" leer.
   - Lass „Add .gitignore" auf „None".
   - Lass „Choose a license" auf „None".

3. Ganz unten ist ein grüner Knopf **„Create repository"** – klicke ihn an.

✅ **Geschafft!** Du siehst jetzt eine Seite mit komischen Befehlen
(`git clone …` etc.). **Diese Befehle ignorierst du komplett.**
Lass die Seite einfach offen.

---

# TEIL 2: Warten, bis die Dateien automatisch landen

Jetzt passiert die Magie **von alleine**. Unser System schickt die Dateien
in den eben erstellten Ordner. Du musst nichts tun. Nur warten und prüfen.

## 2.1 Eine Minute warten

Nimm dir einen Kaffee. Wirklich. ☕

## 2.2 Prüfen, ob die Dateien da sind

1. In deinem Browser: Klicke oben in die Adresszeile.
2. Tippe ein:
   ```
   github.com/CW-Aicono/aicono-os
   ```
3. Drücke Enter.

**Was du jetzt sehen sollst:**

Eine Liste mit Dateinamen, ungefähr so:

```
📁 .github
📁 overlay
📁 scripts
📄 INSTALLATION_FUER_ANFAENGER.md
📄 README.md
📄 REPO_SETUP_ANLEITUNG.md
```

✅ **Wenn du diese Liste siehst: Perfekt, weiter zu Teil 3.**

❌ **Wenn die Seite immer noch leer ist** (nur die `git clone`-Befehle):
- Noch 2 Minuten warten und nochmals Seite neu laden (F5 drücken).
- Wenn auch nach 5 Minuten leer: Schreib mir „Sync funktioniert nicht",
  dann schaue ich nach.

---

# TEIL 3: Den Image-Bau starten

Jetzt der finale Klick, der die fertigen Hardware-Images erzeugt.

## 3.1 Auf „Releases" klicken

Du bist auf **github.com/CW-Aicono/aicono-os**.

1. Schaue **rechts** auf der Seite. Da gibt es eine Spalte mit Überschriften
   wie „About", „Releases", „Packages".
2. Klicke auf **„Releases"** (oder „Create a new release").

> ❓ **Du findest „Releases" nicht?**
> Tippe stattdessen oben in die Adresszeile:
> ```
> github.com/CW-Aicono/aicono-os/releases/new
> ```
> Drücke Enter. Du landest direkt auf der richtigen Seite.

## 3.2 Das Formular ausfüllen

Eine Seite mit dem Titel **„New release"** öffnet sich.

1. Oben siehst du einen Knopf **„Choose a tag"** (grau).
   Klicke ihn an.
2. Ein kleines Eingabefeld erscheint. Tippe genau ein:
   ```
   v2026.05.0
   ```
3. **Unter dem Feld** erscheint die Zeile:
   **„+ Create new tag: v2026.05.0 on publish"** – klicke darauf.

4. Im Feld **„Release title"** tippe:
   ```
   v2026.05.0
   ```

5. Das große Textfeld darunter (**„Describe this release"**)
   lässt du **leer**.

6. Ganz unten ist ein grüner Knopf **„Publish release"** – klicke ihn an.

✅ **Fertig!** Du hast den Image-Bau gestartet.

---

# TEIL 4: Prüfen, ob das Image fertig wird (optional)

Der Bau dauert ca. **15–20 Minuten**. Du musst nichts tun, aber wenn
du zuschauen willst:

1. Tippe in die Adresszeile:
   ```
   github.com/CW-Aicono/aicono-os/actions
   ```
2. Du siehst eine Liste. Ganz oben sollte ein Eintrag stehen mit:
   - 🟡 **Gelber Kreis** = baut gerade
   - ✅ **Grüner Haken** = fertig, alles gut
   - ❌ **Rotes X** = Fehler – schreib mir Bescheid

## Wenn der grüne Haken da ist:

1. Tippe in die Adresszeile:
   ```
   github.com/CW-Aicono/aicono-os/releases
   ```
2. Du siehst dein Release **v2026.05.0** mit einer Liste von Dateien
   (`.img.xz`-Dateien). Das sind die **fertigen Hardware-Images**.

🎉 **Damit kannst du jetzt im AICONO-Backend Images herunterladen
und auf USB-Sticks flashen.**

---

# 🆘 Hilfe-Tabelle für die häufigsten Stolperfallen

| Was du siehst | Was du tun musst |
|---|---|
| „CW-Aicono" ist nicht in deiner Org-Liste | Du brauchst eine Einladung. Frag das Team. |
| Beim Anlegen heißt es „Repository already exists" | Super! Es existiert schon. Direkt zu Teil 2 springen. |
| `github.com/CW-Aicono/aicono-os` zeigt 5 Min lang nur die git-Befehle | Schreib mir „Sync funktioniert nicht". |
| „Choose a tag" Knopf nicht zu finden | Adresszeile: `github.com/CW-Aicono/aicono-os/releases/new` |
| Rotes X bei Actions | Kopier mir die URL der Seite, ich schaue rein. |
| Du klickst was Falsches und panikst | Kein Problem. GitHub löscht nichts versehentlich. Schreib mir. |

---

# Was du NICHT brauchst (zur Beruhigung)

- ❌ Keine Befehlszeile / Terminal
- ❌ Kein `git`-Programm installieren
- ❌ Kein Code anschauen
- ❌ Keine Token erstellen (das hat das Team schon erledigt)
- ❌ Kein Workflow-Editor

Du klickst **nur im Browser** auf Knöpfe. Mehr nicht.

---

## Zusammenfassung in einem Satz

**Leeren Ordner `aicono-os` in der Org `CW-Aicono` anlegen → 1 Minute warten →
unter „Releases" ein neues Release mit Tag `v2026.05.0` veröffentlichen → fertig.**
