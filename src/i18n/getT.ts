/**
 * getT() – context-free translation helper for hooks and non-React code.
 * Reads the persisted language preference from localStorage (same key as
 * useUserPreferences) and falls back to German.
 */
import { translations, TranslationKey, Language } from "./translations";

export function getT() {
  let language: Language = "de";
  try {
    const raw = localStorage.getItem("user_preferences");
    if (raw) {
      const prefs = JSON.parse(raw);
      if (prefs?.language) language = prefs.language as Language;
    }
  } catch {
    // ignore – fall back to "de"
  }

  return (key: TranslationKey): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[language] || entry.de || key;
  };
}
