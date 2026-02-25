/**
 * Shared test helpers & wrapper factories for hook tests.
 */
import React, { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { DemoModeDetector } from "@/contexts/DemoMode";
import { AuthProvider } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenant";

/**
 * Wraps children in the required provider hierarchy for non-demo hooks.
 * initialRoute defaults to "/" (non-demo).
 */
export function createTestWrapper(initialRoute = "/") {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialRoute]}>
        <DemoModeDetector>
          <AuthProvider>
            <TenantProvider>{children}</TenantProvider>
          </AuthProvider>
        </DemoModeDetector>
      </MemoryRouter>
    );
  };
}

/**
 * Wraps children in demo-mode providers (route = /demo).
 */
export function createDemoWrapper() {
  return createTestWrapper("/demo");
}
