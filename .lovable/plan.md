

# Fix: Mieter-Verknüpfung ermöglichen (RLS-Policy-Korrektur)

## Problem
Der Benutzer `christvs@t-online.de` kann sich nicht in die Mein-Strom-App einloggen, obwohl ein aktiver Mieterdatensatz mit dieser E-Mail existiert. Ursache: Die Datenbank-Sicherheitsrichtlinie (RLS) erlaubt keinen **Lese-Zugriff** auf den eigenen Datensatz, solange die Verknüpfung (`auth_user_id`) noch nicht gesetzt ist. Das Auto-Linking kann deshalb nie stattfinden -- ein "Henne-Ei-Problem".

## Loesung
Eine zusaetzliche SELECT-Policy hinzufuegen, die es einem eingeloggten Benutzer erlaubt, den Mieterdatensatz per E-Mail-Abgleich zu **lesen**, damit das Auto-Linking greifen kann.

## Umsetzung

### Schritt 1: Neue RLS-Policy (Datenbankmigration)

Neue SELECT-Policy auf `tenant_electricity_tenants`:

```text
Name: "App tenants can find own record by email for linking"
Bedingung: email = get_auth_user_email()
           AND auth_user_id IS NULL
           AND status = 'active'
```

Das erlaubt einem authentifizierten Benutzer, genau den einen Datensatz zu lesen, dessen E-Mail mit der eigenen uebereinstimmt und der noch nicht verknuepft ist. Sobald das Auto-Linking den `auth_user_id` setzt, greift die bestehende Policy "App tenants can view own record".

### Schritt 2: Keine Code-Aenderungen noetig

Die bestehende Logik in `TenantEnergyApp.tsx` (Zeilen 1051-1068) fuehrt bereits die Email-Suche und das Auto-Linking korrekt durch. Sobald die SELECT-Policy den Lesezugriff erlaubt, funktioniert der gesamte Flow automatisch.

## Technische Details

- Nur **eine SQL-Migration** wird benoetigt
- Die Policy ist eng begrenzt: Nur der eigene Datensatz (via `get_auth_user_email()`), nur wenn noch nicht verknuepft (`auth_user_id IS NULL`), nur wenn aktiv
- Kein Sicherheitsrisiko: Ein Benutzer kann nur seinen eigenen Datensatz sehen, nicht die anderer Mieter

