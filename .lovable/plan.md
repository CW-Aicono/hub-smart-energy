

## HA-Update-Problem: Aufräumen + Cache-Reset

### Diagnose (verifiziert)

- `repository.yaml` ist **gültig** für HA — Claudes Vermutung dort ist falsch. Wir lassen sie unverändert.
- Im Ziel-Repo `CW-Aicono/ha-addons` existiert vermutlich noch ein Alt-Ordner `ems-gateway-hub/` aus der v1/v2-Zeit. Unser Sync-Workflow legt nur `aicono-ems-gateway/` an — entfernt aber alte Ordner **nicht**. HA sieht dadurch potenziell zwei Add-ons und cached durcheinander.
- Die neue Version v3.0.9 liegt korrekt in `docs/ha-addon/config.yaml`. Sync wurde durch deinen letzten Bump getriggert. Wenn HA trotzdem nichts findet, ist es der **Add-on-Store-Cache**.

### Fix in zwei Schritten

**Schritt 1 — Alt-Ordner sauber entfernen (Code-Änderung)**

Sync-Workflow `.github/workflows/sync-ha-addon.yml` so erweitern, dass beim Sync alle alten Add-on-Verzeichnisse außer `aicono-ems-gateway/` und außer Repo-Metadaten (`.git`, `repository.yaml`, `README.md`, `.github`) gelöscht werden. Das räumt einmalig den Alt-Ordner `ems-gateway-hub/` weg und verhindert künftige Doppelungen.

Konkret als zusätzlicher Schritt vor dem `cp`:
```bash
# Alt-Verzeichnisse im Ziel-Repo entfernen (alles außer Allowlist)
find target -mindepth 1 -maxdepth 1 -type d \
  ! -name '.git' \
  ! -name '.github' \
  ! -name 'aicono-ems-gateway' \
  -exec rm -rf {} +
```

Anschließend Version-Bump auf `3.0.10` in `docs/ha-addon/config.yaml` + `docs/ha-addon/package.json`, damit der Sync-Workflow erneut feuert und der Cleanup ausgeführt wird.

**Schritt 2 — HA-Cache zurücksetzen (manuell durch dich, nach Schritt 1)**

In Home Assistant:
1. **Einstellungen → Add-ons → Add-on Store** öffnen
2. Oben rechts auf **⋮ (drei Punkte)** → **„Check for updates"** klicken
3. Falls v3.0.9/v3.0.10 immer noch nicht erscheint:
   - **⋮ → „Repositories"** öffnen
   - `https://github.com/CW-Aicono/ha-addons` löschen
   - **HA neu starten** (Einstellungen → System → ⋮ → Neustart)
   - Repo neu hinzufügen
4. Add-on-Store erneut öffnen — die neue Version muss jetzt sichtbar sein

### Was wir **nicht** tun

- `repository.yaml` → `repository.json` umbenennen: nicht nötig, beide Formate sind offiziell unterstützt. Eine Umbenennung würde nur kosmetisch wirken und kein Problem lösen.
- An den Sync-Tokens / Workflow-Triggern schrauben: der Workflow läuft korrekt, das sehen wir am v3.0.9-Push.

### Betroffene Dateien

- `.github/workflows/sync-ha-addon.yml` — Cleanup-Schritt für alte Add-on-Ordner
- `docs/ha-addon/config.yaml` — Version `3.0.9` → `3.0.10`
- `docs/ha-addon/package.json` — Version `3.0.9` → `3.0.10`

Keine Änderungen am Add-on-Code, keine Änderungen am `repository.yaml`-Format.

