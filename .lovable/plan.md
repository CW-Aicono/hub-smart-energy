

## Ursache

`supabase/functions/_shared/cors.ts` erlaubt nur 3 explizite Origins + alle `*.lovable.app` / `*.lovableproject.com` Subdomains. **`staging.aicono.org` steht nicht auf der Liste und passt auf keinen Wildcard.** Folge: Jeder Browser-Aufruf von dieser Domain bekommt `Access-Control-Allow-Origin: https://hub-smart-energy.lovable.app` zurück, der Browser **blockt** die Antwort, und supabase-js meldet den generischen Fehler „Failed to send a request to the Edge Function".

Das erklärt exakt, warum **alle** Gateway-Typen (Loxone, Shelly Cloud, Home Assistant) identisch fehlschlagen — sie nutzen alle dasselbe `_shared/cors.ts`. Der Loxone-404 in den Logs („Steinfurter Ei") ist ein separates Problem aus einem serverseitigen Cron-Job (kein CORS) und nicht das, was der Nutzer im Screenshot sieht.

## Fix (1 Datei, ~4 Zeilen)

Anpassung in `supabase/functions/_shared/cors.ts`:

1. `https://staging.aicono.org` zur Liste `ALLOWED_ORIGINS` hinzufügen.
2. Wildcard-Match für `*.aicono.org` ergänzen (damit zukünftige Subdomains wie `app.aicono.org`, `ems-pro.aicono.org` usw. ohne Redeploy funktionieren).
3. Optionale Härtung: zusätzlich `http://localhost:*` für lokale Entwicklung erlauben.

Resultierende Prüfung (konzeptionell):
```
isAllowed =
  ALLOWED_ORIGINS.includes(origin)
  || origin.endsWith(".lovable.app")
  || origin.endsWith(".lovableproject.com")
  || origin.endsWith(".aicono.org")
  || origin === "https://aicono.org"
  || /^http:\/\/localhost(:\d+)?$/.test(origin)
```

Es müssen keine Edge Functions einzeln neu deployed werden — sie importieren `getCorsHeaders` pro Request dynamisch, jeder nächste Deploy einer Funktion lädt das geteilte Modul neu. Zur Sicherheit werden die meistgenutzten Funktionen (loxone-api, shelly-api, home-assistant-api, gateway-ingest) explizit neu deployed.

## Verifikation (nach dem Fix)

1. `https://staging.aicono.org` öffnen → Liegenschaft → Integration → „Sensoren anzeigen".
2. DevTools → Netzwerk → Filter `loxone-api`. Antwort muss `access-control-allow-origin: https://staging.aicono.org` und HTTP 200 enthalten.
3. Wiederholen für eine Shelly-Cloud- und eine Home-Assistant-Integration.
4. Edge-Function-Logs sollten normale `getSensors`-Aufrufe ohne 401-/CORS-bedingte frühe Abbrüche zeigen.

Falls eine einzelne Integration nach dem Fix weiterhin fehlschlägt, ist das ein gerätespezifisches Problem (z. B. der bestehende Loxone-404 für „Steinfurter Ei") und wird separat diagnostiziert.

## Was dieser Plan NICHT anfasst

- Gateway-spezifische Logik, Auth oder Credentials.
- Den verbleibenden Loxone-404 für „Steinfurter Ei" (separate Aufgabe nach dem CORS-Fix).
- Produktion (`ems-pro.aicono.org`) funktioniert bereits — steht schon in der Allow-Liste.

