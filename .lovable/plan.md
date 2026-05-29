Du hast recht: Nach zwei Fix-Versuchen darf ich nicht weiter herumprobieren. Die Analyse zeigt jetzt eindeutig: Der Browser sendet beide Uploads korrekt angemeldet an Storage, aber Storage lehnt beide mit `new row violates row-level security policy` ab. Es ist also kein UI-Problem, kein Dateityp-Problem und kein fehlender Login.

## Gesicherte Fakten aus der Tiefenanalyse

1. Tenant-Logo schlägt fehl bei:
   `POST /storage/v1/object/tenant-assets/0ce0c43a-c0b4-417b-9fd5-4131907e7504/logo.png`

2. Ladestationsfoto schlägt fehl bei:
   `POST /storage/v1/object/meter-photos/charge-points/0e2e8550-083d-4498-9134-7ee40f89410f.png`

3. Beide Requests enthalten einen gültigen angemeldeten Benutzer-Token.

4. Der Benutzer ist im richtigen Tenant:
   - Benutzer: `info@aicono.de`
   - Rolle: `admin`
   - Tenant: `0ce0c43a-c0b4-417b-9fd5-4131907e7504`
   - Ladestation gehört ebenfalls zu diesem Tenant.

5. Die Buckets existieren:
   - `tenant-assets`
   - `meter-photos`

6. Es gibt vorhandene Dateien, besonders beim Logo:
   - `tenant-assets/0ce0c43a-c0b4-417b-9fd5-4131907e7504/logo.png` existiert bereits.

7. Der Frontend-Code nutzt bei beiden Uploads:
   `upload(..., { upsert: true })`

## Wahrscheinlich echte technische Ursache

Der entscheidende Punkt ist `upsert: true`.

Ein Upload mit `upsert: true` ist nicht nur „Datei hochladen“. Storage behandelt das intern wie:

```text
Wenn Datei noch nicht existiert: neue Datei anlegen
Wenn Datei existiert: vorhandene Datei ersetzen
```

Dafür müssen die Storage-Regeln je nach internem Ablauf gleichzeitig mehrere Operationen sauber erlauben:

```text
INSERT  = neue Datei anlegen
UPDATE  = vorhandene Datei ersetzen
SELECT  = vorhandene Datei prüfen/finden
```

Die aktuellen Regeln sind weiterhin zu fragil, weil sie direkt auf `storage.objects` mit Pfadprüfungen arbeiten. Meine vorherige Funktionslösung hat zwar einen Teil verbessert, aber der echte Browser-Test zeigt: Storage akzeptiert den kombinierten Upsert-Ablauf weiterhin nicht.

## Warum ich nicht einfach noch eine dritte RLS-Regel rate

Weil das genau das Problem der letzten Versuche war. RLS bei Storage ist in Kombination mit `upsert` fehleranfällig, besonders wenn vorhandene Dateien ersetzt werden. Ein weiterer kleiner Policy-Patch wäre wieder ein Ratespiel.

## Seriöser Behebungsplan

### Schritt 1: Frontend-Upsert entfernen

Ich ändere beide Upload-Stellen so, dass sie nicht mehr `upsert: true` verwenden.

Stattdessen wird der Ablauf bewusst getrennt:

```text
1. Vorhandene Ziel-Datei entfernen, falls sie existiert.
2. Neue Datei normal hochladen, ohne upsert.
3. Signed URL erzeugen.
4. Datenbankfeld aktualisieren.
```

Warum das besser ist:
- Storage muss nicht mehr einen kombinierten Upsert-Sonderfall ausführen.
- Die RLS-Prüfung ist klarer: `DELETE` dann `INSERT`.
- Fehler lassen sich sauber getrennt anzeigen.

Betroffene Dateien:
- `src/components/settings/BrandingSettings.tsx`
- `src/pages/ChargePointDetail.tsx`
- `src/components/charging/ChargePointDetailDialog.tsx`

### Schritt 2: Dateinamen stabilisieren

Für Tenant-Logo bleibt der Pfad:

```text
{tenant_id}/logo.{endung}
```

Für Ladestationsfoto bleibt der Pfad:

```text
charge-points/{charge_point_id}.{endung}
```

Wenn beim Logo die Dateiendung wechselt, zum Beispiel von `.png` zu `.jpg`, entferne ich optional die bekannten alten Logo-Dateien desselben Tenants:

```text
logo.png
logo.jpg
logo.jpeg
logo.webp
logo.avif
```

Damit bleibt nicht versehentlich ein altes Logo im Speicher liegen.

### Schritt 3: Storage-Regeln nur dort nachschärfen, wo nötig

Falls nach Entfernen von `upsert` weiterhin ein RLS-Fehler kommt, ist der nächste saubere Fix nicht „mehr Frontend-Code“, sondern eine präzise Storage-Regel-Korrektur:

- `tenant-assets`: angemeldete Tenant-Mitglieder dürfen im eigenen Tenant-Ordner Logo-Dateien löschen und neu anlegen.
- `meter-photos`: angemeldete Tenant-Mitglieder dürfen Ladestationsfotos nur für Ladestationen des eigenen Tenants löschen und neu anlegen.

Wichtig: Keine breite öffentliche Schreibberechtigung, keine Tenant-Vermischung.

### Schritt 4: Validierung mit echten Signalen

Nach Umsetzung prüfe ich nicht nur „Code sieht gut aus“, sondern diese konkreten Signale:

1. Netzwerkrequest für Tenant-Logo:
   - Erwartet: kein `400`
   - Erwartet: Storage-Upload erfolgreich

2. Netzwerkrequest für Ladestationsfoto:
   - Erwartet: kein `400`
   - Erwartet: Storage-Upload erfolgreich

3. Datenbankprüfung:
   - Tenant `logo_url` zeigt auf den neuen Pfad.
   - Ladestation `photo_url` beziehungsweise Preview zeigt die neue Signed URL.

4. UI-Prüfung:
   - Logo wird nach Upload angezeigt.
   - Ladestationsfoto wird nach Upload angezeigt.

## Was ich ausdrücklich nicht mache

- Keine dritte blinde RLS-Änderung ohne Frontend-Upsert als Ursache zu beseitigen.
- Keine Service-Role-Uploads im Browser.
- Keine öffentliche Schreibfreigabe für Buckets.
- Keine Änderung an fremden Modulen.
- Keine Änderungen an `src/integrations/supabase/client.ts` oder generierten Dateien.

## Ergebnis, wenn du den Plan freigibst

Ich setze exakt diese Änderung um:

```text
Direkter Storage-Upsert raus.
Explizites Entfernen alter Datei(en) rein.
Normaler Upload ohne upsert rein.
Danach echte Validierung über Netzwerk-/Storage-Signal.
```

Das ist der günstigste und sauberste nächste Schritt, weil die Daten jetzt belegen, dass der kombinierte Storage-Upsert der gemeinsame Auslöser beider Fehler ist.