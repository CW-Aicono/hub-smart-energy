
## Cookie Consent Banner – Klarere Ablehnen-Option

### Problem

Der aktuelle Banner hat bereits eine Ablehnen-Funktion ("Nur notwendige Cookies"), aber der Begriff ist rechtlich und nutzerseitig nicht eindeutig genug. Laut DSGVO/TTDSG muss das Ablehnen genauso prominent und einfach sein wie das Akzeptieren.

### Lösung

Den Cookie-Banner in `src/components/CookieConsent.tsx` überarbeiten:

1. **Drei klare Buttons** in gleichwertiger Prominenz:
   - "Alle ablehnen" (neu, klar benannt)
   - "Nur notwendige" (bleibt als mittlere Option)
   - "Alle akzeptieren"

   Alternativ zwei gleichwertige Buttons: "Alle ablehnen" | "Alle akzeptieren" (mit optionalem Link zu individuellen Einstellungen).

2. **Empfohlene Umsetzung – 3 gleichwertige Optionen:**
   ```
   [ Alle ablehnen ]  [ Nur notwendige ]  [ Alle akzeptieren ]
   ```
   Alle drei Buttons sind gleich groß und gleich prominent dargestellt (nur die Farbe unterscheidet sie leicht).

3. **Logik bleibt identisch**: "Alle ablehnen" und "Nur notwendige" speichern beide `rejected` in localStorage, da es inhaltlich dasselbe ist – keine optionalen Cookies werden gesetzt.

4. **Mobile X-Button** wird ebenfalls zu "Alle ablehnen" umbenannt (oder entfernt zugunsten der Buttons).

### Technische Änderungen

Nur eine Datei wird geändert:

- **`src/components/CookieConsent.tsx`**: Button-Leiste anpassen – einen dritten Button "Alle ablehnen" hinzufügen, Reihenfolge und Styling angleichen.

### Keine weiteren Abhängigkeiten

Keine Datenbankänderungen, keine neuen Pakete, keine weiteren Dateien betroffen.
