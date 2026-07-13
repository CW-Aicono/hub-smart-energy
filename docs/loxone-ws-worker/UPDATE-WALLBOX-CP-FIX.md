# Update: Wallbox „Cp" (Current Charging Power) korrekt erkennen

> **Was ändert sich?** Der Worker kennt jetzt die Wallbox-Kennungen `Cp` (aktuelle Ladeleistung) und die Wallbox-Energiezähler `Cd/Cm/Cy/Mr`. Vorher hat er stattdessen fälschlich den Wert von `Ca` (Charging allowed = 0/1) als „Leistung" gemeldet – deshalb stand im Dashboard konstant „1,00 kW" an der Wallbox.
>
> **Zeitaufwand:** ca. 5 Minuten.
> **Vorkenntnisse:** Keine. Sie kopieren nur Textblöcke und fügen sie ein.
> **Ausfallzeit:** ca. 30 Sekunden (der Worker startet neu).

---

## Was brauchen Sie?

- Zugang zu Ihrem Hetzner-Server (dasselbe SSH-Passwort wie bei der Erstinstallation)
- Ihren `GATEWAY_API_KEY` und die `SUPABASE_URL` – **nur falls Sie den Container komplett neu starten müssen** (Schritt 5). Beide finden Sie im AICONO-Backend → Einstellungen → Integrationen → Reiter **API**.

> Wenn Sie die Werte damals aufgeschrieben haben: liegen lassen, Sie brauchen sie evtl. gleich.

---

## Schritt 1: Auf den Server einloggen

Öffnen Sie die Eingabeaufforderung (Windows: `cmd`) bzw. Terminal (Mac) und tippen Sie:

```bash
ssh root@IHRE.SERVER.IP.ADRESSE
```

Passwort eingeben. Wenn Sie die Zeile `root@mein-server:~#` sehen, sind Sie drin.

---

## Schritt 2: In den Worker-Ordner wechseln

```bash
cd /opt/loxone-ws-worker
```

---

## Schritt 3: Die neue Version der Datei `index.ts` einspielen

Sie brauchen die neueste Version von `docs/loxone-ws-worker/index.ts` aus dem AICONO-Projekt. Es gibt zwei Wege – wählen Sie den, der bei Ihnen einfacher ist:

### Weg A (empfohlen): Direkt vom GitHub-Repo laden

Falls Ihr Server das AICONO-Repo bereits geklont hat:

```bash
cd /opt/loxone-ws-worker
git pull
```

Danach weiter mit Schritt 4.

### Weg B: Datei manuell überschreiben (Copy & Paste)

1. Öffnen Sie in Lovable im Dateibaum links `docs/loxone-ws-worker/index.ts`.
2. Markieren Sie den **kompletten** Inhalt (Strg+A / Cmd+A) und kopieren Sie ihn (Strg+C / Cmd+C).
3. Auf dem Server öffnen Sie die Datei zum Bearbeiten:

   ```bash
   nano /opt/loxone-ws-worker/index.ts
   ```

4. Alten Inhalt löschen: **Strg+K** so oft drücken, bis die Datei leer ist (oder `Strg+_` → `Strg+V` → oberste Zeile eingeben, dann `Strg+K` gedrückt halten).

   Einfacher: Datei komplett löschen und neu anlegen:

   ```bash
   rm /opt/loxone-ws-worker/index.ts
   nano /opt/loxone-ws-worker/index.ts
   ```

5. In `nano` mit **Rechtsklick → Einfügen** (oder Strg+Shift+V) den kopierten Inhalt einfügen.
6. Speichern: **Strg+O**, dann **Enter**. Schließen: **Strg+X**.

---

## Schritt 4: Prüfen, dass der Fix wirklich in der Datei steht

Tippen Sie:

```bash
grep -n "chargingpower" /opt/loxone-ws-worker/index.ts
```

➡️ **Erwartetes Ergebnis:** Sie sehen eine Zeile, die u. a. `cp|chargingpower|currentchargingpower` enthält.

Wenn nichts kommt: Die neue Datei wurde nicht korrekt eingespielt – zurück zu Schritt 3.

---

## Schritt 5: Docker-Container neu bauen und starten

Alten Container stoppen und löschen:

```bash
docker rm -f loxone-ws-worker
```

➡️ **Erwartetes Ergebnis:** `loxone-ws-worker`

Neu bauen (dauert ca. 30–60 Sekunden):

```bash
docker build -t loxone-ws-worker .
```

➡️ **Erwartetes Ergebnis:** Am Ende steht `Successfully tagged loxone-ws-worker:latest`.

Starten – **exakt derselbe Befehl wie bei der Erstinstallation.** Ersetzen Sie die Platzhalter durch Ihre Werte:

```bash
docker run -d --restart=always --name loxone-ws-worker \
  -p 8080:8080 \
  -e SUPABASE_URL=[HIER_SUPABASE_URL] \
  -e GATEWAY_API_KEY=[HIER_API_KEY] \
  -e LOG_LEVEL=info \
  -e WORKER_HOST=hetzner-prod-1 \
  -e BRIDGE_WORKER_NAME=hetzner-bridge-test \
  loxone-ws-worker
```

> **Hinweis:** Wenn Sie damals andere Werte für `WORKER_HOST` oder `BRIDGE_WORKER_NAME` verwendet haben, nehmen Sie die – unbedingt gleich wie vorher.

---

## Schritt 6: Prüfen, ob der Worker wieder läuft

```bash
docker logs --tail 30 loxone-ws-worker
```

➡️ **Was Sie sehen sollten:**
- Zeilen wie `[WS] ... LoxAPP3-Mapping: blocks=..., mapped=..., fallback=..., totalStateUuids=...`
- Kein `error` in den letzten Zeilen.
- Nach 10–20 Sekunden erste Werte-Zeilen mit `role=pwr`, `role=today`, usw.

---

## Schritt 7: Im AICONO-Dashboard prüfen

1. Öffnen Sie das Dashboard mit dem **Energieflussmonitor**.
2. **Aktualisieren Sie die Seite** (F5 bzw. Cmd+R), damit der Browser die neuen Live-Daten frisch abonniert.
3. Schauen Sie an die Wallbox-Kachel:
   - **Wenn kein Auto lädt:** Wert sollte jetzt **0,00 kW** stehen (statt 1,00 kW).
   - **Wenn ein Auto lädt:** Wert sollte die reale Ladeleistung in kW zeigen.

Sekündliche Aktualisierung ist normal, sobald die Wallbox lädt.

---

## Wenn etwas schiefgeht

**Container startet nicht / stürzt sofort ab:**

```bash
docker logs --tail 100 loxone-ws-worker
```

Suchen Sie nach der ersten `error`-Zeile – meistens ist ein Umgebungswert (`SUPABASE_URL` oder `GATEWAY_API_KEY`) falsch geschrieben.

**Wallbox zeigt weiter „1,00 kW":**

- Browser hart neu laden (Strg+Shift+R / Cmd+Shift+R).
- Warten Sie 1–2 Minuten – der Worker muss beim Miniserver einmal das komplette LoxAPP3-Mapping neu anfordern.
- Kontrollieren Sie im Log, ob die Wallbox-UUID neu klassifiziert wurde:
  ```bash
  docker logs loxone-ws-worker 2>&1 | grep -i "cp\|charging"
  ```

**Zurück zur alten Version (Notfall):**

Falls Sie den alten `index.ts` als Sicherheitskopie haben:

```bash
cp /opt/loxone-ws-worker/index.ts.bak /opt/loxone-ws-worker/index.ts
docker rm -f loxone-ws-worker
docker build -t loxone-ws-worker .
# ... danach denselben docker run wie oben
```

> **Tipp für die Zukunft:** Vor jedem Update einmal
> ```bash
> cp /opt/loxone-ws-worker/index.ts /opt/loxone-ws-worker/index.ts.bak
> ```
> ausführen. Dann haben Sie immer eine Sicherheitskopie.

---

## Fertig

Der Worker meldet jetzt für Wallbox-Blöcke:

| Loxone-Kennung | Bedeutung | Rolle im Backend |
|----------------|-----------|-------------------|
| `Cp` | Current charging power (kW) | `pwr` |
| `Cd` | Consumption today (kWh) | `today` |
| `Cm` | Consumption this month (kWh) | `month` |
| `Cy` | Consumption this year (kWh) | `year` |
| `Mr` | Meter reading total (kWh) | `total` |

Alle anderen Meter (Netz, Speicher, Produktion, Verbrauch) sind vom Update **nicht** betroffen und laufen wie gewohnt weiter.
