

# BSI TR-03181 & CON.8 -- Schrittweise Umsetzung

Die Befunde werden nach Prioritaet in 6 Schritte aufgeteilt. Jeder Schritt ist ein eigenstaendiges, testbares Arbeitspaket.

---

## Schritt 1: Gateway-Ingest GET-Routen absichern (K4 -- Kritisch)

**Problem:** `list-locations` und `list-meters` sind ohne jede Authentifizierung aufrufbar und geben alle Standorte/Zaehler zurueck.

**Loesung:** Die bestehende `validateApiKey()`-Funktion wird auch fuer GET-Routen aufgerufen.

**Datei:** `supabase/functions/gateway-ingest/index.ts`
- Zeilen 292-295: API-Key-Validierung vor den GET-Handlern einfuegen

```text
// Vorher:
if (req.method === "GET") {
    if (action === "list-locations") return handleListLocations();
    if (action === "list-meters") return handleListMeters(url);
}

// Nachher:
if (req.method === "GET") {
    const authErr = validateApiKey(req);
    if (authErr) return authErr;
    if (action === "list-locations") return handleListLocations();
    if (action === "list-meters") return handleListMeters(url);
}
```

---

## Schritt 2: CORS auf bekannte Origins einschraenken (K3 -- Kritisch)

**Problem:** Alle 26 Edge Functions setzen `Access-Control-Allow-Origin: "*"`.

**Loesung:** Gemeinsame CORS-Helper-Datei erstellen und in allen Functions verwenden.

**Neue Datei:** `supabase/functions/_shared/cors.ts`

```typescript
const ALLOWED_ORIGINS = [
  "https://hub-smart-energy.lovable.app",
  "https://id-preview--1e1d0ab0-a25d-49ac-9d3a-662f96a9ba12.lovable.app",
];

export function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const isAllowed = ALLOWED_ORIGINS.some((o) => origin === o || origin.endsWith(".lovable.app"));
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Vary": "Origin",
  };
}
```

**Aenderung in allen 26 Edge Functions:**
- Statisches `corsHeaders`-Objekt durch dynamischen `getCorsHeaders(req)`-Aufruf ersetzen
- Import: `import { getCorsHeaders } from "../_shared/cors.ts";`

Da `gateway-ingest` und einige System-Functions (periodic-sync, cron) keinen Browser-Origin senden, wird der Fallback-Origin zurueckgegeben -- das ist sicher, da der Browser dann den CORS-Check verweigert.

---

## Schritt 3: DB-Fehlerdetails aus API-Responses entfernen (H2 -- Hoch)

**Problem:** Interne DB-Fehlermeldungen werden an Clients zurueckgegeben (z.B. `gateway-ingest` Zeile 269).

**Loesung:** Generische Fehlermeldung an Client, Details nur in `console.error`.

**Betroffene Dateien und Stellen:**
- `supabase/functions/gateway-ingest/index.ts` -- Zeilen 87, 123, 152, 205, 269:
  - `error.message` aus JSON-Response entfernen, nur `"Database error"` oder `"Internal error"` zurueckgeben
  - `console.error` behaelt die Details fuer Server-Logs

Beispiel:
```typescript
// Vorher (Zeile 269):
return json({ error: "Database error", details: error.message }, 500);

// Nachher:
return json({ error: "Database error" }, 500);
```

Gleiches Muster auf alle Edge Functions anwenden, die `error.message` in Responses ausgeben.

---

## Schritt 4: CSP-Header in index.html (K2 -- Hoch)

**Problem:** Keine Content-Security-Policy definiert.

**Loesung:** Meta-Tag in `index.html` einfuegen.

**Datei:** `index.html` -- nach Zeile 5

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org;
  font-src 'self';
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com https://*.tile.openstreetmap.org;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
" />
```

Hinweis: `'unsafe-inline'` fuer Styles ist noetig wegen Tailwind/Recharts Inline-Styles. Scripts bleiben strikt auf `'self'`.

---

## Schritt 5: listUsers durch gezielten Lookup ersetzen (N1 -- Niedrig)

**Problem:** `listUsers()` laedt alle Benutzer zum E-Mail-Abgleich.

**Betroffene Dateien:**
- `supabase/functions/invite-tenant-admin/index.ts` (Zeile 70)
- `supabase/functions/activate-invited-user/index.ts` (Zeile 115)

**Loesung:** `listUsers` durch gefilterten Aufruf ersetzen:

```typescript
// Vorher:
const { data: listData } = await supabase.auth.admin.listUsers();
const existingUser = listData.users.find((u) => u.email === adminEmail);

// Nachher:
const { data: listData } = await supabase.auth.admin.listUsers({
  filter: `email.eq.${adminEmail}`,
  perPage: 1,
});
const existingUser = listData?.users?.[0];
```

---

## Schritt 6: Eingabevalidierung in invite-tenant-admin (H1 -- Teilfix)

**Problem:** Request-Body wird ohne Schema-Validierung verarbeitet.

**Datei:** `supabase/functions/invite-tenant-admin/index.ts`

**Loesung:** Einfache Typ-/Format-Pruefung nach dem `req.json()` Aufruf (Zeile 39):

```typescript
const { tenantId, adminEmail, adminName, role, redirectTo } = await req.json();

// Validierung
if (!tenantId || typeof tenantId !== "string") throw new Error("Invalid tenantId");
if (!adminEmail || typeof adminEmail !== "string" || !adminEmail.includes("@"))
  throw new Error("Invalid email");
if (adminName && typeof adminName !== "string") throw new Error("Invalid adminName");
if (role && !["admin", "user"].includes(role)) throw new Error("Invalid role");
```

---

## Nicht in diesem Durchgang (hoehere Aufwaende)

Die folgenden Befunde erfordern groessere Architekturentscheidungen und werden in einem Folgeschritt behandelt:

| Befund | Grund fuer Verschiebung |
|---|---|
| K1 -- Credential-Verschluesselung | Erfordert Vault-Setup oder AES-Implementierung |
| H3 -- Audit-Log | Erfordert neue Tabelle + Trigger-Infrastruktur |
| M1 -- RLS-Verschaerfung | Erfordert umfangreiche Policy-Analyse und Tests |
| M2 -- Rate-Limiting | Infrastruktur-Ebene, nicht in Edge Functions allein loesbar |
| H1 vollstaendig -- Zod in allen Functions | 26 Functions, schrittweise umsetzbar |

---

## Zusammenfassung

| Schritt | Befund | Aufwand | Dateien |
|---|---|---|---|
| 1 | K4 Gateway Auth | 5 min | gateway-ingest/index.ts |
| 2 | K3 CORS | 30 min | _shared/cors.ts + 26 Functions |
| 3 | H2 Error Leaks | 15 min | Mehrere Edge Functions |
| 4 | K2 CSP Header | 5 min | index.html |
| 5 | N1 listUsers | 10 min | 2 Edge Functions |
| 6 | H1 Input Validation | 10 min | invite-tenant-admin |

