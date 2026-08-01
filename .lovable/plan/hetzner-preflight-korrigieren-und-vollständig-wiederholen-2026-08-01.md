# Hetzner-Preflight korrigieren und vollständig wiederholen

## Bestätigter Befund

„Live“ ist die echte AICONO-Seite für Kunden auf Hetzner; Lovable/Preview ist der Test- und Entwicklungsstand hier.

Der lesende Vorabtest hat PostgreSQL 15.8 und eine Realtime-Publikation mit `pubupdate = true`, `pubdelete = true` und `pubviaroot = false` bestätigt. Danach brach ausschließlich die Diagnoseabfrage ab: PostgreSQL erlaubt einen SELECT-Alias im `ORDER BY`, aber nicht den Ausdruck `relation::text`, wenn `relation` nur ein Ausgabe-Alias ist.

Im Diagnoseblock gibt es drei gleichartige Stellen:

- `ORDER BY pt.level, relation::text`
- `ORDER BY partition::text`
- `ORDER BY relation::text, conname`

Dadurch liegen noch keine Ergebnisse zu Replica Identity, Publication-Mitgliedschaft, Waisen, Constraints, angewendeten Migrationen oder Refresh-Funktionen vor. Ein neuer Deploy wird deshalb noch nicht freigegeben.

## Umsetzung

1. Alle drei Sortierungen in der Hetzner-Anleitung auf ihre echten Quellausdrücke umstellen, statt typisierte Ausgabe-Aliase zu referenzieren.
2. Den gesamten Block weiterhin mit `ON_ERROR_STOP=1` ausführen, damit keine unvollständige Diagnose irrtümlich als Erfolg gilt.
3. Die Anleitung um einen eindeutigen Erfolgshinweis ergänzen: Nur eine Ausgabe, die bis zu beiden Funktionsdefinitionen durchläuft und zur Shell zurückkehrt, ist vollständig.
4. Den korrigierten, weiterhin ausschließlich lesenden Block auf Hetzner komplett wiederholen.
5. Erst die vollständige Ausgabe auswerten und prüfen:
   - Replica Identity von Parent und allen Leaf-Partitionen,
   - tatsächliche Realtime-Mitgliedschaft,
   - Anzahl und Partitionen verwaister `meter_id`,
   - vorhandene Constraints,
   - Stand der blockierenden Migrationen,
   - Definitionen beider Refresh-Funktionen.
6. Nur wenn der reale Hetzner-Zustand zum vorbereiteten Reparaturpfad passt, den nächsten Deploy freigeben; bei Abweichungen die Migration gezielt an die Ausgabe anpassen.

## Technische Änderung

Betroffen ist ausschließlich `docs/HETZNER_5MIN_DEPLOY_PREFLIGHT.md`. Der Deploy-Runner verwendet diese fehlerhaften Alias-Sortierungen nicht und wird in diesem Schritt nicht geändert. Es werden weder Live-Daten verändert noch Migrationen ausgeführt.