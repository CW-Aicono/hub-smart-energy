# AICONO Hub OS – Repo-Setup für Anfänger

> **Ziel:** Das Repository `CW-Aicono/aicono-os` auf GitHub anlegen und so einrichten,
> dass automatisch Build-Images erzeugt werden.
> **Dauer:** ca. 10 Minuten.
> **Du brauchst:** Einen GitHub-Account mit Zugriff auf die Organisation `CW-Aicono`.

---

## ⚠ Wichtig vorab: Was ist ein „Repo"?

Ein **Repository** (kurz: Repo) ist ein Ordner auf GitHub, in dem Dateien liegen
(ähnlich wie ein Dropbox-Ordner, aber für Programmcode).

Das Repo `CW-Aicono/aicono-os` ist der Ort, an dem die fertigen AICONO Hub-Images
gebaut und als Download bereitgestellt werden.

---

## Schritt 1: Leeres Repo auf GitHub anlegen (3 Minuten)

### 1.1 Auf GitHub einloggen

1. Öffne deinen Browser.
2. Gehe zu: **https://github.com**
3. Klicke oben rechts auf dein **Profilbild** → **„Your organizations"**.
4. Wähle die Organisation **CW-Aicono** aus.

> Falls du `CW-Aicono` nicht siehst: Du musst von einem Admin der Organisation
eingeladen werden. Bitte David, dich hinzuzufügen.

### 1.2 Neues Repository erstellen

1. Innerhalb der Organisation `CW-Aicono` klicke auf den grünen Button
   **„New repository"** (oder „Neues Repository").
2. Fülle das Formular aus:
   - **Repository name:** `aicono-os`
   - **Description (optional):** `AICONO Hub OS – HAOS-Images mit vorinstalliertem EMS-Gateway`
   - **Visibility:** Wähle **Private** (empfohlen) oder **Public**.
     - *Private* = nur du und das Team sehen die Downloads.
     - *Public* = jeder kann die Images herunterladen.
   - **Initialize this repository with:** **NICHTS** ankreuzen – das Repo muss
     **leer** bleiben! (Also kein Häkchen bei „Add a README file" oder „Add .gitignore".)
3. Klicke auf **„Create repository"**.

> ✅ Du siehst jetzt eine Seite mit Anleitungen für ein leeres Repo.
> Diese Seite brauchst du für Schritt 3.

---

## Schritt 2: Token-Rechte prüfen (2 Minuten)

Das automatische Spiegeln funktioniert über einen **GitHub Token** namens
`HA_ADDONS_PUSH_TOKEN`. Dieser Token muss das Recht haben, in das neue
Repo `aicono-os` hineinzuschreiben.

Da `aicono-os` in der **gleichen Organisation** (`CW-Aicono`) liegt wie das
bestehende Repo (`ha-addons`), reicht das meistens automatisch.

### So prüfst du es:

1. Klicke oben rechts auf dein **Profilbild** → **„Settings"**.
2. Scrollen ganz nach unten im linken Menü auf **„Developer settings"**.
3. Klicke auf **„Personal access tokens"** → **„Tokens (classic)"**.
4. Suche den Token `HA_ADDONS_PUSH_TOKEN` in der Liste.
5. Klicke ihn an. Unter **„Permissions"** sollte stehen:
   - `repo` (voller Zugriff auf alle Repos in der Organisation)
   - oder `write:packages` / `read:packages`

> ✅ Wenn `repo` aktiv ist: Fertig, weiter mit Schritt 3.

> ❌ Wenn der Token nur ein einzelnes Repo darf (nicht die ganze Organisation):
> Du musst den Token neu erstellen oder einem Admin Bescheid sagen, dass der
> Token `repo`-Scope für die Organisation `CW-Aicono` braucht.

---

## Schritt 3: Ersten Sync auslösen (3 Minuten)

Der Sync-Workflow liegt bereits in deinem Hauptprojekt (`hub-smart-energy`).
Sobald du eine Datei in `docs/aicono-os/**` änderst und auf `main` pushst,
läuft der Workflow automatisch.

### 3.1 Kleine Test-Änderung machen

1. Öffne die Datei `docs/aicono-os/README.md` in deinem Projekt
   (`hub-smart-energy`) – z. B. im Code-Editor von Lovable oder lokal.
2. Füge ganz unten eine Zeile hinzu, z. B.:
   ```
   <!-- Sync-Test: aicono-os ready -->
   ```
3. Speichern und committen:
   - **In Lovable:** Die Änderung wird automatisch committed.
   - **Lokal:**
     ```bash
     git add docs/aicono-os/README.md
     git commit -m "chore: trigger aicono-os sync"
     git push origin main
     ```

### 3.2 Auf GitHub prüfen, ob der Sync gelaufen ist

1. Gehe zu **https://github.com/CW-Aicono/hub-smart-energy/actions**
   (oder dem Namen deines Haupt-Repos).
2. Du siehst einen Workflow-Lauf mit dem Titel:
   **„Mirror aicono-os to CW-Aicono/aicono-os"**.
3. Klicke ihn an. Wenn ein grüner Haken ✅ erscheint: Alles wurde gespiegelt.
4. Prüfe nun das Ziel-Repo:
   **https://github.com/CW-Aicono/aicono-os**
   → Dort sollten jetzt alle Dateien aus `docs/aicono-os/` liegen.

> ✅ Wenn die Dateien da sind: Der Sync funktioniert.

---

## Schritt 4: Ersten Image-Build auslösen (2 Minuten)

Jetzt, wo das Repo existiert und alle Dateien gespiegelt sind, kannst du
den ersten Build starten. Das geht über einen **Git Tag**.

### Was ist ein Git Tag?

Ein Tag ist wie ein Etikett auf einer bestimmten Version. Hier heißt das
Tag einfach `v2026.05.0` – das ist nur ein Name, der den Build startet.

### 4.1 Tag setzen und pushen

Du hast zwei Möglichkeiten:

#### Variante A: Direkt auf GitHub (einfacher)

1. Gehe zu **https://github.com/CW-Aicono/aicono-os**
2. Klicke rechts auf **„Releases"** (oder „Releases and tags").
3. Klicke auf **„Create a new release"**.
4. Unter **„Choose a tag"** tippe ein: `v2026.05.0`
5. Wähle **„Create new tag: v2026.05.0 on publish"**.
6. Titel: `v2026.05.0`
7. Klicke auf **„Publish release"**.

> ✅ Das löst automatisch den Build-Workflow aus.

#### Variante B: Im Terminal (für erfahrenere Nutzer)

```bash
# Repo lokal clonen (einmalig)
git clone https://github.com/CW-Aicono/aicono-os.git
cd aicono-os

# Tag setzen und pushen
git tag v2026.05.0
git push origin v2026.05.0
```

---

## Schritt 5: Build-Status prüfen

1. Gehe zu **https://github.com/CW-Aicono/aicono-os/actions**
2. Du siehst einen laufenden Workflow namens **„Build AICONO Hub OS Images"**.
3. Das dauert ca. **10–20 Minuten**.
4. Wenn fertig (grüner Haken ✅):
   - Gehe zu **https://github.com/CW-Aicono/aicono-os/releases**
   - Dort liegen die fertigen Images als `.img.xz`-Dateien zum Download bereit.

---

## 🆘 Hilfe-Tabelle

| Problem | Lösung |
|---|---|
| Workflow „Mirror aicono-os" ist rot ❌ | Auf den roten Lauf klicken → Logs ansehen. Meistens ist der Token `HA_ADDONS_PUSH_TOKEN` abgelaufen oder hat keine Schreibrechte auf `aicono-os`. |
| `aicono-os` Repo bleibt leer | Schritt 2 prüfen – hat der Token `repo`-Scope? Ist das Repo wirklich unter `CW-Aicono/aicono-os` angelegt? |
| Kein Release erscheint | Unter **Actions** prüfen, ob der Build-Workflow überhaupt gestartet ist. Manchmal muss man im Repo unter **Settings → Actions → General** „Allow all actions" aktivieren. |
| Image-Build schlägt fehl | In den Workflow-Logs nach „Error" suchen. Meist fehlt eine Datei im Overlay-Ordner oder der Download-Link für HAOS hat sich geändert. |

---

## Zusammenfassung in 3 Sätzen

1. Leeres Repo `CW-Aicono/aicono-os` anlegen.
2. Test-Push auf `main` im Hauptprojekt machen → Sync-Workflow spiegelt alles rüber.
3. Tag `v2026.05.0` erstellen → Build startet automatisch, fertige Images erscheinen unter Releases.

> **Wichtig:** Sobald der Sync einmal läuft, musst du Schritt 1–3 nie wiederholen.
> Alle zukünftigen Änderungen an `docs/aicono-os/` werden automatisch gespiegelt.
