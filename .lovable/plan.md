

# Multi-Tenant White-Label Architektur

## Datenmodell

```
Tenants (Organisationen)
├── Branding (Logo, Farben, Schriftarten)
├── Standorte (hierarchisch)
│   ├── Gebäude
│   │   └── Bereiche
│   └── Energiedaten
├── Benutzer (mit Rollen)
├── Reports (im Tenant-CI)
└── Einstellungen
```

### Neue Tabellen:

**`tenants`** – Organisationen/Mandanten
- Name, Adresse, Kontakt
- Branding-Einstellungen (JSON: Farben, Schriftart)
- Logo-URL (Storage)
- Report-Template-Einstellungen

**`locations`** – Hierarchische Standorte
- tenant_id (Zugehörigkeit)
- parent_id (für Hierarchie)
- Typ: standort | gebaeude | bereich
- Koordinaten, Adresse

**`energy_readings`** – Verbrauchsdaten
- location_id
- Typ: strom | gas | waerme
- Wert, Zeitstempel

## White-Label Features

1. **Dynamisches Theming**
   - CSS-Variablen werden zur Laufzeit aus Tenant-Einstellungen geladen
   - Logo im Header/Sidebar dynamisch
   
2. **Branded Reports (PDF)**
   - Tenant-Logo im Header
   - Farben aus CI
   - Benutzerdefinierte Fußzeile

3. **Storage für Tenant-Assets**
   - Bucket für Logos und Dokumente

## Benutzer-Zuordnung

- Jeder Benutzer gehört zu genau einem Tenant
- Admins verwalten ihren Tenant
- Super-Admins (optional) verwalten alle Tenants

