
## Ziel
Integration-Erstellung wird komplett in die Liegenschaft verschoben. Die globale Seite `/integrations` (Tab "Gateways") wird zur reinen Übersicht mit Status + "Verbindung testen".

## 1. Neuer Flow in der Liegenschaft (Kachel "Integrationen")

**Datei:** `src/components/integrations/AddIntegrationDialog.tsx` umbauen (oder durch `CreateIntegrationDialog.tsx` ersetzen)

- Schritt 1: Felder **Name**, **Gateway-Typ** (Dropdown aus `getGatewayTypes()`), **Beschreibung (optional)**
- Schritt 2: Dynamische Config-Felder aus `gatewayDef.configFields` (wie heute)
- Buttons: "Verbindung testen" + "Hinzufügen"

**Submit-Logik (eine Aktion, zwei Inserts):**
1. `createIntegration({ name, type, category: gatewayDef.category, description, icon, config: { connection_status: "disconnected" }, is_active: true })` → liefert `integration_id`
2. `addIntegration(locationId, integration_id, configFields)` → erstellt `location_integrations`-Eintrag

→ `useIntegrations.createIntegration` muss die neu erzeugte ID zuverlässig zurückgeben (heute wird die ID via "select last" geholt — auf RETURNING umstellen, siehe unten).

**Auswahl bestehender Integrationen entfernen:** Dropdown "Integration auswählen" entfällt. Jede Liegenschaft erzeugt ihre eigenen Integrationen. (Tenant-weite Wiederverwendung wird damit für Gateways aufgegeben — gewünscht laut Anforderung.)

## 2. Hook-Anpassung

**Datei:** `src/hooks/useIntegrations.tsx`
- `createIntegration`: aktuell wird via `useTenantQuery.insert` eingefügt und danach `select().order().limit(1).single()` geholt → unsicher bei parallelen Calls. Auf direktes `supabase.from("integrations").insert(...).select().single()` mit Tenant-ID umstellen, damit die echte neue ID zurückkommt.

## 3. Globale Seite `/integrations` – Tab "Gateways" als reine Übersicht

**Datei:** `src/pages/Integrations.tsx`
- Header-Button **"+ Integration erstellen"** entfernen
- Dialog (Erstellen/Bearbeiten) komplett entfernen (`Dialog`, `Form`, alle State-Variablen `dialogOpen`, `editingIntegration`, `handleEdit`, `onSubmit`, `handleDelete`)
- Karten je Integration zeigen nur noch:
  - Name + Gateway-Typ-Label
  - Status-Badge (Verbunden / Nicht verbunden)
  - Anzahl verknüpfter Liegenschaften (klein, optional, via separater Query auf `location_integrations`)
  - Button **"Verbindung testen"** (`handleTestConnection` bleibt)
- Icons **Bearbeiten** (Pencil) und **Löschen** (Trash2) entfernen
- Leerzustand-Text anpassen: Hinweis "Integrationen werden in der jeweiligen Liegenschaft angelegt" + Link zur Liegenschaftsübersicht

## 4. Übersetzungen

**Dateien:** `src/i18n/locales/{de,en,es,nl}/integrations.ts` (oder vergleichbar — beim Implementieren prüfen)
- Neuer Key `integrations.createdInLocationHint` (Leerzustand)
- Bestehende Keys `integrations.create`, `integrations.editTitle`, `integrations.deleted` etc. bleiben für die Liegenschafts-Dialoge.

## 5. Tests anpassen

- `src/pages/__tests__/Integrations.test.tsx`: Erwartung "renders title" bleibt; Button "Integration erstellen" darf nicht mehr existieren.
- `src/components/integrations/__tests__/` (falls Tests für `AddIntegrationDialog` existieren): Flow mit Name/Typ-Eingabe statt Dropdown-Auswahl testen.

## 6. Anleitung v8.2

**Datei (neu):** `/mnt/documents/AICONO_EMS_Gateway_Installation_v8.2.docx`

Generiert mit dem `docx`-Skill (Node + `docx`-Lib), Layout & Styles wie v8.1. Änderungen:
- Titel/Footer auf **v8.2**
- **Kapitel 4.2 "Neues Gateway anlegen"** komplett neu: 
  1. In AICONO Cloud → **Liegenschaften** → gewünschte Liegenschaft öffnen
  2. Kachel **Integrationen** → **+ Integration hinzufügen**
  3. Name, Gateway-Typ "Home Assistant", optional Beschreibung
  4. Pflichtfelder (API-URL, Gateway-API-Key, Tenant-ID, Device-Name) eintragen
  5. **Verbindung testen** → **Hinzufügen**
- Verweise auf "Einstellungen → Integrationen" entfernen / umformulieren in "Übersicht aller Gateways unter Einstellungen → Integrationen (nur Status & Test)"
- QA: PDF + JPG-Konvertierung aller Seiten zur visuellen Prüfung (siehe docx-Skill)

## Technische Hinweise
- RLS auf `integrations` und `location_integrations` ist tenant-basiert — kein Migrationsbedarf.
- `gatewayDef.category` muss in der `category`-Spalte landen (heute "gateways"); Standardwert prüfen, sonst Fallback `"gateways"`.
- Keine DB-Schema-Änderungen, keine Edge-Function-Änderungen.

## Out of Scope
- Bestehende, "leere" Tenant-Integrationen (ohne Liegenschaftsbindung) bleiben erhalten und werden in der Übersicht weiter angezeigt; keine automatische Migration.
