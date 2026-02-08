

# Smart Energy Hub B2B

Ein professionelles B2B-Energie-Dashboard mit Login, Benutzerprofilen und umfassender Energiedatenvisualisierung.

## Design & Branding
- **Corporate & professioneller Look**: Dunkle Primärfarben (z.B. tiefes Blau/Anthrazit), scharfe Typografie, Business-Ästhetik
- **Akzentfarben** in Grün für Nachhaltigkeits-KPIs und Energie-Themen
- **Klares, aufgeräumtes Layout** mit Sidebar-Navigation

## Seite 1: Auth-Seite (Login & Registrierung)
- Professionelle Login-/Signup-Seite mit E-Mail und Passwort
- Markenlogo und Corporate-Design
- Automatische Weiterleitung zum Dashboard nach Login

## Seite 2: Energie-Dashboard (Hauptseite)
Vier Hauptbereiche als Karten/Widgets:

1. **Energieverbrauch-Charts** – Linien-/Balkendiagramme für Strom, Gas und Wärme über verschiedene Zeiträume (Tag/Woche/Monat)
2. **Kostenübersicht** – Aktuelle Kosten, Einsparungen und Vergleich zum Vormonat als KPI-Karten
3. **Nachhaltigkeits-KPIs** – CO₂-Emissionen, Fortschritt zu Nachhaltigkeitszielen mit Fortschrittsbalken
4. **Alerts & Benachrichtigungen** – Liste mit Warnungen bei ungewöhnlichem Verbrauch oder wichtigen Updates

## Backend (Lovable Cloud / Supabase)
- **Authentifizierung**: E-Mail/Passwort Login & Signup
- **Profiles-Tabelle**: Firmenname, Ansprechpartner, Rolle
- **Geschützte Routen**: Dashboard nur für eingeloggte Benutzer zugänglich

## Hinweis
Da wir einfach starten, werden die Dashboard-Daten zunächst mit realistischen Demo-Daten befüllt. Echte Datenquellen können später angebunden werden.

