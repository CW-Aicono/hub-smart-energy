import { createContext, useContext, ReactNode } from "react";
import { translations, TranslationKey, Language } from "@/i18n/translations";
import { useUserPreferences } from "./useUserPreferences";

interface TranslationContextType {
  t: (key: TranslationKey) => string;
  language: Language;
}

const TranslationContext = createContext<TranslationContextType | null>(null);

export function TranslationProvider({ children }: { children: ReactNode }) {
  const { preferences } = useUserPreferences();
  const language: Language = (preferences?.language as Language) ?? "de";

  const t = (key: TranslationKey): string => {
    const translation = translations[key];
    if (!translation) {
      console.warn(`Translation missing for key: ${key}`);
      return key;
    }
    return translation[language] || translation.de || key;
  };

  return (
    <TranslationContext.Provider value={{ t, language }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) {
    // Fallback when not wrapped in provider
    return {
      t: (key: TranslationKey): string => {
        const translation = translations[key];
        return translation?.de || key;
      },
      language: "de" as Language,
    };
  }
  return context;
}
