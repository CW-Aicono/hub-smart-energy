import { useSAPreferences } from "./useSuperAdminPreferences";
import { saTranslations, SALanguage } from "@/i18n/superAdminTranslations";

export function useSATranslation() {
  const { language } = useSAPreferences();

  const t = (key: string): string => {
    const entry = saTranslations[key];
    if (!entry) {
      console.warn(`SA translation missing: ${key}`);
      return key;
    }
    return entry[language] || entry.de || key;
  };

  return { t, language };
}
