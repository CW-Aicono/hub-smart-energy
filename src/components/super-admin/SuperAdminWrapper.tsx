import { ReactNode } from "react";
import { SAPreferencesProvider } from "@/hooks/useSuperAdminPreferences";

export function SuperAdminWrapper({ children }: { children: ReactNode }) {
  return (
    <SAPreferencesProvider>
      {children}
    </SAPreferencesProvider>
  );
}
