import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import type { TranslationKey, Language } from "@/i18n/translations";
import { useUserPreferences } from "./useUserPreferences";

type TranslationMap = Record<string, Record<string, string>>;

interface TranslationContextType {
  t: (key: TranslationKey) => string;
  language: Language;
}

const TranslationContext = createContext<TranslationContextType | null>(null);

// Lazy-loaded translations – kept in module scope so they load only once
let cachedTranslations: TranslationMap | null = null;
let loadPromise: Promise<TranslationMap> | null = null;

function loadTranslations(): Promise<TranslationMap> {
  if (cachedTranslations) return Promise.resolve(cachedTranslations);
  if (!loadPromise) {
    loadPromise = import("@/i18n/translations").then((m) => {
      cachedTranslations = m.translations as unknown as TranslationMap;
      return cachedTranslations;
    });
  }
  return loadPromise;
}

export function TranslationProvider({ children }: { children: ReactNode }) {
  const { preferences } = useUserPreferences();
  const language: Language = (preferences?.language as Language) ?? "de";
  const [translations, setTranslations] = useState<TranslationMap | null>(cachedTranslations);

  useEffect(() => {
    if (!translations) {
      loadTranslations().then(setTranslations);
    }
  }, [translations]);

  const t = useCallback(
    (key: TranslationKey): string => {
      if (!translations) return key as string;
      const entry = translations[key as string];
      if (!entry) return key as string;
      return entry[language] || entry.de || (key as string);
    },
    [translations, language],
  );

  return (
    <TranslationContext.Provider value={{ t, language }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) {
    return {
      t: (key: TranslationKey): string => {
        if (!cachedTranslations) return key as string;
        const entry = cachedTranslations[key as string];
        return entry?.de || (key as string);
      },
      language: "de" as Language,
    };
  }
  return context;
}
