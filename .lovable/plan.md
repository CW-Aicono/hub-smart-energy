# Zwei separate PWAs: Lade-App und Meter Mate

## Problem

Aktuell gibt es nur eine einzige `manifest.json` mit `start_url: "/m"`. Wenn beide Apps auf dem iPhone installiert werden, verwenden sie dasselbe Manifest und landen daher immer bei der Meter-Mate-App.

## Losung

Zwei separate Manifest-Dateien erstellen, die jeweils uber eine eigene Route eingebunden werden.

## Schritte

### 1. Neues Manifest fur die Lade-App erstellen

Eine neue Datei `public/manifest-ev.json` mit:

- `name`: "SmartCharge" (o.a.)
- `start_url`: "/ev"
- `display`: "standalone"
- Eigene Icons (vorerst dieselben, spater austauschbar)

### 2. Bestehendes Manifest anpassen

`public/manifest.json` bleibt fur Meter Mate mit `start_url: "/m"` -- hier andert sich nichts.

### 3. Manifest dynamisch pro Route einbinden

Da eine HTML-Datei nur ein `<link rel="manifest">` haben kann, muss das Manifest dynamisch gesetzt werden:

- Aus `index.html` den statischen `<link rel="manifest">` entfernen
- In den Einstiegskomponenten (`ChargingApp` fur `/ev`, `MobileApp` fur `/m`) per `useEffect` das passende Manifest-Tag im `<head>` setzen
- Fur alle anderen Routen (Desktop-App) wird kein Manifest oder das Standard-Manifest geladen

### 4. Apple-Meta-Tags pro App anpassen

- `apple-mobile-web-app-title` dynamisch setzen ("Meter Mate" vs. "Smart Charging")
- Optional: Unterschiedliche `apple-touch-icon`-Referenzen

## Technische Details

```text
public/
  manifest.json        --> start_url: "/m"  (Meter Mate)
  manifest-ev.json     --> start_url: "/ev" (Lade-App)
  icon-192.png
  icon-512.png

index.html
  - Kein statisches <link rel="manifest"> mehr

src/pages/MobileApp.tsx
  - useEffect: setzt <link rel="manifest" href="/manifest.json">
  - setzt apple-mobile-web-app-title = "Meter Mate"

src/pages/ChargingApp.tsx
  - useEffect: setzt <link rel="manifest" href="/manifest-ev.json">
  - setzt apple-mobile-web-app-title = "Smart Charging"
```

### Wichtig

Nach der Anderung mussen beide Apps auf dem iPhone **neu installiert** werden (alte vom Homescreen loschen, Seite erneut offnen, "Zum Home-Bildschirm" wahlen), damit das jeweilige Manifest korrekt ubernommen wird.