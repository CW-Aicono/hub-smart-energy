

## Fehleranalyse aus den Schneider Gateway-Logs

Die `system.log` enthält die exakten Fehlermeldungen der HTTPS-Publikation. Es gibt **zwei separate Probleme**, die beide den Push verhindern:

### Problem 1: „URI path begins with multiple slashes"

```text
2026-03-26T15:25:15 ERR HttpsMessageTransport
  Failed https publication request: URI path begins with multiple slashes
```

**Ursache:** Der Panel Server baut die URL intern zusammen als `https://{server}:{port}{pfad}`. Wenn im Pfad-Feld ein führender `/` steht UND gleichzeitig der Server-Wert auf `/` endet (oder `https://` enthält), entsteht ein doppelter Slash (`//`), den die Java HTTP-Bibliothek (`org.apache.hc.core5`) als ungültig ablehnt.

**Lösung:** Im Panel Server den **Pfad ohne führenden Slash** eingeben oder sicherstellen, dass der Server-Wert **kein** `https://` und keinen Trailing-Slash enthält. Konkret:
- **Server:** `xnveugycurplszevdxtw.supabase.co` (ohne `https://`, ohne `/` am Ende)
- **Pfad:** `functions/v1/gateway-ingest?action=schneider-push&tenant_id=...` (ohne führenden `/`)

Alternativ den Pfad mit führendem `/` belassen, aber den Server-Wert bereinigen.

### Problem 2: TLS-Zertifikatsfehler (SHA384withECDSA)

```text
2026-03-26T15:27:09 ERR HttpsMessageTransport
  PKIX path validation failed: Algorithm constraints check failed
  on signature algorithm: SHA384withECDSA
```

**Ursache:** Die Java-Runtime auf dem PAS800L (ältere eingebettete JVM) unterstützt den Signaturalgorithmus `SHA384withECDSA` nicht oder hat ihn in den Security-Constraints blockiert. Das Backend-TLS-Zertifikat verwendet diesen Algorithmus, und der Panel Server lehnt den TLS-Handshake ab.

**Lösung:** Im Panel Server muss die **TLS-Zertifikatsvalidierung deaktiviert** werden (Option „Serverzertifikat nicht prüfen" / „Trust all certificates" / „SSL-Verifikation deaktivieren"). Dies ist bei IoT-Geräten mit HTTPS-Push zu Cloud-Endpoints üblich und sicher, solange die Daten nur an den bekannten Host gesendet werden.

### Zeitliche Korrelation mit dem Audit-Log

Das `audit.log` zeigt, dass heute um **14:57 – 15:28 Uhr** mehrere `CONFIGURATION_CHANGE`-Einträge für HTTPS vorgenommen wurden (Zeilen 102-110). Diese korrelieren exakt mit den Fehlermeldungen in der `system.log`. Das bestätigt, dass der Benutzer die HTTPS-Publikation aktiv konfiguriert hat, aber beide Fehler auftreten.

### Zusammenfassung der nächsten Schritte

| Schritt | Aktion | Wo |
|---------|--------|----|
| 1 | Server-Feld bereinigen: nur `xnveugycurplszevdxtw.supabase.co` (kein `https://`, kein `/`) | Panel Server UI |
| 2 | Pfad-Feld: `functions/v1/gateway-ingest?action=schneider-push&tenant_id=...` (ggf. ohne führenden `/` testen) | Panel Server UI |
| 3 | TLS-Zertifikatsvalidierung deaktivieren (Option in HTTPS-Publikation) | Panel Server UI |
| 4 | Erneut testen und `system.log` prüfen | Panel Server |

### Code-Anpassung: SchneiderSetupInfo verbessern

**Datei:** `src/components/integrations/SchneiderSetupInfo.tsx`

- Pfad-Anzeige **ohne führenden `/`** anbieten (mit Hinweis, dass manche Firmware den `/` nicht akzeptiert)
- Warnung ergänzen: „TLS-Zertifikatsvalidierung im Panel Server deaktivieren"
- Hinweis zum Server-Feld: „Ohne `https://` und ohne `/` am Ende eingeben"

**Datei:** `src/lib/gatewayRegistry.ts`

- `pathTemplate` anpassen: führenden `/` entfernen → `functions/v1/gateway-ingest?action=schneider-push&tenant_id={tenant_id}`

