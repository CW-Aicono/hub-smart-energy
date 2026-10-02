/**
 * Board-eigene Strings in 4 Sprachen.
 * Bewusst eigenständig gehalten, damit die PWA nicht den großen
 * translations.ts-Bundle laden muss.
 */
export type BoardLang = "de" | "en" | "es" | "nl";

const STRINGS = {
  loading: { de: "Lädt …", en: "Loading …", es: "Cargando …", nl: "Laden …" },
  notActivated: {
    de: "C-Level Dashboard nicht aktiviert",
    en: "C-Level Dashboard not enabled",
    es: "C-Level Dashboard no activado",
    nl: "C-Level Dashboard niet geactiveerd",
  },
  notActivatedHint: {
    de: "Dieses Modul ist für deinen Tenant noch nicht freigeschaltet. Bitte wende dich an deinen AICONO-Ansprechpartner.",
    en: "This module is not enabled for your tenant yet. Please contact your AICONO representative.",
    es: "Este módulo aún no está activado para tu tenant. Contacta con tu responsable de AICONO.",
    nl: "Deze module is nog niet vrijgegeven voor je tenant. Neem contact op met je AICONO-aanspreekpunt.",
  },
  backToMain: { de: "Zurück zur Hauptanwendung", en: "Back to main app", es: "Volver a la aplicación", nl: "Terug naar hoofd-app" },
  noTenant: {
    de: "Kein Tenant-Zugriff für diesen Account.",
    en: "No tenant access for this account.",
    es: "Sin acceso a tenant para esta cuenta.",
    nl: "Geen tenant-toegang voor dit account.",
  },
  template: { de: "Vorlage", en: "Template", es: "Plantilla", nl: "Sjabloon" },
  settings: { de: "Einstellungen", en: "Settings", es: "Ajustes", nl: "Instellingen" },
  appearance: { de: "Erscheinungsbild", en: "Appearance", es: "Apariencia", nl: "Weergave" },
  theme: { de: "Theme", en: "Theme", es: "Tema", nl: "Thema" },
  pickTemplate: { de: "Vorlage wählen", en: "Choose template", es: "Elegir plantilla", nl: "Sjabloon kiezen" },
  colorScheme: { de: "Farbschema", en: "Color scheme", es: "Esquema de colores", nl: "Kleurenschema" },
  light: { de: "Hell", en: "Light", es: "Claro", nl: "Licht" },
  dark: { de: "Dunkel", en: "Dark", es: "Oscuro", nl: "Donker" },
  system: { de: "System", en: "System", es: "Sistema", nl: "Systeem" },
  customize: { de: "Anpassen", en: "Customize", es: "Personalizar", nl: "Aanpassen" },
  done: { de: "Fertig", en: "Done", es: "Listo", nl: "Klaar" },
  tile: { de: "Kachel", en: "Tile", es: "Tarjeta", nl: "Tegel" },
  reset: { de: "Reset", en: "Reset", es: "Restablecer", nl: "Reset" },
  resetTitle: {
    de: "Layout auf Template zurücksetzen",
    en: "Reset layout to template",
    es: "Restablecer al diseño de la plantilla",
    nl: "Layout terug naar sjabloon",
  },
  signOut: { de: "Abmelden", en: "Sign out", es: "Cerrar sesión", nl: "Afmelden" },
  emptyTiles: {
    de: "Keine Kacheln ausgewählt. Wähle ein Template oder ergänze Kacheln im Anpassen-Modus.",
    en: "No tiles selected. Pick a template or add tiles in customize mode.",
    es: "Sin tarjetas. Elige una plantilla o añade tarjetas en modo edición.",
    nl: "Geen tegels. Kies een sjabloon of voeg tegels toe in bewerkmodus.",
  },
  customizeHint: {
    de: "Anpassen-Modus: Kacheln per Drag & Drop verschieben, Größe (S/M/L) per Klick auf das Symbol oben rechts ändern, mit ✕ entfernen.",
    en: "Customize: drag tiles to reorder, click the resize icon to cycle S/M/L, use ✕ to remove.",
    es: "Modo edición: arrastra para reordenar, pulsa el icono para cambiar S/M/L, ✕ para quitar.",
    nl: "Bewerkmodus: sleep tegels, klik op het icoon voor S/M/L, ✕ om te verwijderen.",
  },
  active: { de: "aktiv", en: "active", es: "activo", nl: "actief" },
  pullToRefresh: {
    de: "Loslassen zum Aktualisieren",
    en: "Release to refresh",
    es: "Suelta para actualizar",
    nl: "Loslaten om te verversen",
  },
  pullMore: {
    de: "Weiter ziehen …",
    en: "Pull to refresh …",
    es: "Desliza hacia abajo …",
    nl: "Verder trekken …",
  },
  refreshing: { de: "Aktualisiert …", en: "Refreshing …", es: "Actualizando …", nl: "Verversen …" },
  noData: { de: "Keine Daten", en: "No data", es: "Sin datos", nl: "Geen data" },
  offlineCached: {
    de: "Offline — Daten vom letzten Stand",
    en: "Offline — showing last cached data",
    es: "Sin conexión — datos en caché",
    nl: "Offline — laatst bekende data",
  },
} as const;

export type BoardKey = keyof typeof STRINGS;

export function boardT(key: BoardKey, lang: BoardLang): string {
  const entry = STRINGS[key];
  return (entry as Record<BoardLang, string>)[lang] ?? entry.de;
}
