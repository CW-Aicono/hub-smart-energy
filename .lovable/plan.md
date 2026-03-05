

## Plan: Haftungsdisclaimer und AGB integrieren

### Problemstellung
Es fehlen rechtliche Disclaimer für KI-Analysen, automatisierte Schaltvorgänge und finanzrelevante Daten. Für B2B-Einsatz werden AGB benötigt, die die Haftung für indirekte Schäden begrenzen.

### Änderungen

**1. AGB als dritte rechtliche Seite hinzufügen**

- `LegalPagesSettings.tsx`: Neuen Tab "Nutzungsbedingungen (AGB)" mit Icon `ScrollText` zur bestehenden PAGES-Liste hinzufügen (key: `agb`)
- `LegalPageView.tsx`: Fallback-Platzhalter für AGB ergänzen (Haftungsbeschränkung für KI-Analysen, Energiedaten, automatisierte Vorgänge)
- `App.tsx`: Neue Route `/agb` mit `<LegalPageView pageKey="agb" />`

**2. KI-Disclaimer in relevante Widgets einbauen**

Kleine, dezente Hinweiszeile am unteren Rand folgender Komponenten:

- `AnomalyWidget.tsx` – nach den Ergebnissen: *"KI-gestützte Analyse – keine Gewähr für Vollständigkeit oder Richtigkeit. Keine Grundlage für geschäftskritische Entscheidungen ohne fachliche Prüfung."*
- `ArbitrageAiWidget.tsx` – nach den Vorschlägen: gleicher Disclaimer
- `ArbitrageAiSuggestions.tsx` – vor dem "Übernehmen"-Button: gleicher Disclaimer
- `AlertsList.tsx` – am unteren Rand: *"Schwellenwert-Alarme dienen der Orientierung. Keine Haftung für verspätete oder ausbleibende Benachrichtigungen."*

Umsetzung: Einheitliche, wiederverwendbare `<AiDisclaimer />` Komponente mit konfigurierbarem Text.

**3. Footer-Links erweitern**

- `CookieConsent.tsx` und ggf. App-Footer: Link zu `/agb` neben Datenschutz und Impressum ergänzen

**4. Keine DB-Migration nötig**

Die bestehende `legal_pages`-Tabelle mit `page_key`-Feld unterstützt bereits beliebige Seiten. Der neue key `agb` wird einfach per Upsert eingefügt.

### Neue Dateien
- `src/components/ui/ai-disclaimer.tsx` – wiederverwendbare Disclaimer-Komponente

### Geänderte Dateien
- `src/components/settings/LegalPagesSettings.tsx` – AGB-Tab
- `src/pages/LegalPageView.tsx` – AGB-Fallback
- `src/App.tsx` – Route `/agb`
- `src/components/dashboard/AnomalyWidget.tsx` – Disclaimer
- `src/components/dashboard/ArbitrageAiWidget.tsx` – Disclaimer
- `src/components/charging/ArbitrageAiSuggestions.tsx` – Disclaimer
- `src/components/dashboard/AlertsList.tsx` – Disclaimer
- `src/components/CookieConsent.tsx` – AGB-Link

