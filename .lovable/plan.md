

## Iteration 11 – Projekt bearbeiten + Dokumenten-Anhänge

### 1. Projekt bearbeiten
- `SalesProjectNew.tsx` → extrahieren in wiederverwendbare `SalesProjectForm.tsx` (Props: `mode: 'create' | 'edit'`, optional `initialValues` + `projectId`)
- Neue Seite `SalesProjectEdit.tsx` an Route `/sales/:id/edit` (lädt Projekt, rendert Form im Edit-Modus, schreibt via `update`)
- "Bearbeiten"-Button (Pencil) im Header von `SalesProjectDetail.tsx` neben Trash → navigiert zu `/sales/:id/edit`

### 2. Dokumenten-Anhänge

**Schema (Migration):**
- Neue Tabelle `sales_project_attachments`: `id`, `project_id` (FK cascade), `partner_id`, `file_path`, `file_name`, `content_type`, `file_size`, `kategorie` (default `'sonstiges'`: grundriss/rechnung/foto/sonstiges), `notiz`, `created_at`
- RLS: Partner darf nur eigene Projekte verwalten (`sales_projects.partner_id = auth.uid()`)
- Storage: bestehender `sales-photos` Bucket; Pfad: `${partner_id}/projects/${project_id}/${uuid}.${ext}`
- Storage-RLS-Policy auf bestehendes Muster (`split_part(name,'/',1) = auth.uid()`)

**UI – `ProjectAttachments.tsx`:**
- Eingebettet in `SalesProjectDetail.tsx` als Card "Dokumente" zwischen Kundeninfo und Verteilungen
- Zwei Upload-Buttons:
  - **Kamera** (`<input capture="environment" accept="image/*">`)
  - **Datei wählen** (`<input accept="image/*,application/pdf">`)
- Liste mit Bild-Thumbnail (signed URL, 1h) bzw. PDF-Icon
- Pro Eintrag: Vorschau-Klick (signed URL neuer Tab), Kategorie-Dropdown inline editierbar, Löschen

### 3. Anlage-Flow (gewählter Weg)
`SalesProjectForm` legt Projekt an wie bisher und navigiert zu `/sales/:id`. Dort sieht der User die Upload-Card direkt – **keine Sondermechanik im Create-Flow**.

### 4. Distributions-Foto-Thumbnail
- `CabinetPhotoAnalyzer` existiert bereits in `DistributionSheet` (Kamera-Aufnahme NSHV-Foto) – keine Änderung
- Ergänzung: kleines Vorschau-Thumbnail in der Verteilungs-Kachel auf `SalesProjectDetail` (signed URL des `cabinet_photo_path`), wenn vorhanden

### Reihenfolge
1. Migration: `sales_project_attachments` + RLS + Storage-RLS für `sales-photos` Pfad `${uid}/projects/...`
2. `SalesProjectForm.tsx` extrahieren, `SalesProjectNew.tsx` darauf umstellen
3. `SalesProjectEdit.tsx` + Route in `App.tsx`
4. "Bearbeiten"-Button im Header `SalesProjectDetail.tsx`
5. `ProjectAttachments.tsx` + Einbindung
6. Verteilungs-Kachel: Cabinet-Foto-Thumbnail

