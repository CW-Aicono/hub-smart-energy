import { createContext, useContext, ReactNode } from "react";
import { useLocation } from "react-router-dom";

const DemoModeContext = createContext(false);

export function DemoModeDetector({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isDemo = location.pathname === "/demo";
  return (
    <DemoModeContext.Provider value={isDemo}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  return useContext(DemoModeContext);
}
