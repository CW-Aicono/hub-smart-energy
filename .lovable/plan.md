## Ziel
Iteration A abschließen: Mitglieder können in der Mitgliederliste den Community-Vertrag digital unterzeichnen.

## Änderungen (nur `src/pages/EnergySharing.tsx`, MembersTab)

1. **Neuer Action-Button pro Tabellenzeile** (in der letzten `TableCell`, vor dem Löschen-Button):
   - `FileSignature`-Icon-Button (ghost, size sm)
   - Tooltip/Title „Vertrag unterzeichnen"
   - `onClick={() => setSignMember(m)}`
   - Visuell als „erledigt" markiert (deaktiviert + Häkchen), wenn `m.status === "active"` (Signatur-Logik setzt Status auf active)

2. **`<SignContractDialog>` am Ende des MembersTab-Returns** rendern:
   - `open={!!signMember}`
   - `onOpenChange={(o) => !o && setSignMember(null)}`
   - `member={signMember}`
   - `communityId={communityId}`
   - `communityName={communityName}`
   - Bereits importiert? Falls nein: Import oben ergänzen.

3. **Imports prüfen/ergänzen**: `FileSignature` (lucide-react) und `SignContractDialog`.

## Nicht im Scope
- Keine Schema-Änderungen, keine neuen Hooks, keine Logik in `SignContractDialog` selbst.
- Keine weiteren Iterations-A-Punkte (alles andere ist erledigt).

## Verifikation
- `/energy-sharing` öffnen → Community → Tab „Mitglieder" → Signatur-Button erscheint pro Zeile → Dialog öffnet sich mit gerendertem Vertrag.
