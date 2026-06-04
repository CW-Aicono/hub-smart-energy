# Plan: Bessere KI-Analyse der Unterverteilung

Kombination aus **stärkerem Modell** (`google/gemini-2.5-pro`) und **Zwei-Pass-Analyse**. Ziel: deutlich bessere Zähl-Genauigkeit (FI, LS, Phasen, freie Plätze) und keine erfundenen Verbraucher mehr.

## Was geändert wird

Nur eine Datei: `supabase/functions/sales-analyze-cabinet/index.ts`.
Keine DB-Migration, keine Schema-Änderung, keine Frontend-Änderung nötig (Antwortformat bleibt rückwärtskompatibel).

## Pass 1 — Reine Beobachtung (Zählen, kein Vorschlag)

- Modell: `google/gemini-2.5-pro`
- System-Prompt: "Du bist Elektrofachkraft. Du zählst NUR, was im Bild eindeutig sichtbar ist. Du erfindest nichts. Wenn unklar → Feld leer lassen oder `null`."
- User-Prompt fordert striktes JSON mit:
  ```
  {
    "bildqualitaet": "gut" | "mittel" | "schlecht",
    "anzahl_reihen": number,
    "fi_schutzschalter": [{ "polig": 2|4, "nennstrom_a": number|null, "ausloesestrom_ma": number|null }],
    "leitungsschutzschalter": [{ "polig": 1|3, "charakteristik": "B"|"C"|null, "nennstrom_a": number|null, "anzahl": number }],
    "n_schienen": number,
    "pe_schienen": number,
    "klemmen_bloecke": number,
    "freie_te_plaetze": number|null,
    "zuleitung": { "phasen": 1|3|null, "von_oben_oder_unten": "oben"|"unten"|null },
    "bereits_verbaute_zaehler": [{ "typ": string, "beschriftung": string|null }],
    "beschriftungen_sichtbar": [string],
    "nicht_eindeutig_erkennbar": [string]
  }
  ```
- `response_format: json_object`
- Plausibilitäts-Check serverseitig: Summe LS-Anzahl ≤ 2× Reihen × 12 (typische Reihenbreite), sonst Warnung.

## Pass 2 — Vorschläge auf Basis der Zahlen

- Modell: `google/gemini-2.5-pro` (gleich, Pro ist gut im Begründen)
- Input: das exakte Pass-1-JSON als Text (KEIN Bild mehr → kein Re-Halluzinieren von Komponenten)
- System-Prompt: "Du schlägst Messpunkte nur auf Basis der übergebenen Zähl-Daten vor. Du darfst KEINE Verbraucher erfinden (PV, Wallbox, Wärmepumpe, Maschine) sofern in `beschriftungen_sichtbar` kein Hinweis darauf ist. Maximal 4 Vorschläge."
- Vorschlagslogik (im Prompt erzwungen):
  - Wenn Zuleitung 3-phasig → 1 Vorschlag "Hauptzähler" Wandlermessung passend zur Zuleitung
  - Pro FI-Gruppe max. 1 neutraler Gruppen-Vorschlag ("Abgangsgruppe FI 1", einphasig 63 A Sammelschiene)
  - Spezifische Typen (PV/Wallbox/WP/Maschine) NUR wenn entsprechende Beschriftung in `beschriftungen_sichtbar`
  - Sonst: `anwendungsfall: "Sonstiges"` oder `"Abgang"`
- Output-Schema (rückwärtskompatibel zum bestehenden Frontend):
  ```
  {
    "zusammenfassung": string,
    "erkannte_sicherungen": number,    // aus Pass 1 zusammengezählt
    "freie_hutschienen_plaetze": number,
    "bildqualitaet": "gut"|"mittel"|"schlecht",   // NEU, optional
    "erkannte_komponenten": { ... aus Pass 1 ... }, // NEU, optional
    "unsicherheiten": [string],                    // NEU, optional
    "vorschlaege": [ { bezeichnung, energieart, phasen, strombereich_a, anwendungsfall, montage, hinweise, sicherheit?: "hoch"|"mittel"|"niedrig" } ]
  }
  ```
- `erkannte_sicherungen` und `freie_hutschienen_plaetze` werden serverseitig aus Pass-1-Daten gefüllt (nicht von der KI), damit Frontend-Werte garantiert konsistent sind.

## Fehlerbehandlung

- Pass 1 fehlgeschlagen → 500 wie heute, kein Pass 2.
- Pass 2 fehlgeschlagen → wir liefern trotzdem Pass-1-Daten zurück mit leerer `vorschlaege`-Liste und Hinweis in `zusammenfassung`.
- 429/402 Handling bleibt.

## Erwartung & Kosten

- ~6–10× teurer pro Analyse (zwei Pro-Calls statt ein Flash-Call), Latenz ~3× (typisch 15–25 s).
- Erwartung: Zählung von FI/LS/freien Plätzen deutlich näher an dem, was der Techniker selbst sieht; keine erfundenen PV/Wallbox-Vorschläge mehr.

## Nicht Teil dieses Plans

- Kein Self-Consistency (mehrfache Calls + Mehrheitsvotum).
- Kein User-Feedback-Loop / "Training" auf eigenen Bildern.
- Keine UI-Änderungen — falls die neuen Felder (`bildqualitaet`, `unsicherheiten`) im UI sichtbar sein sollen, separater kleiner Folge-Plan.
