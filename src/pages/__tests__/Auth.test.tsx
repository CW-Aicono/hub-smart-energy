import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false, signIn: vi.fn() }),
  AuthProvider: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (k: string) => k, language: "de" }),
  TranslationProvider: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { resetPasswordForEmail: vi.fn() } },
}));
vi.mock("@/assets/aicono-logo.png", () => ({ default: "logo.png" }));

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const W = ({ children }: any) => (
  <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
);

describe("Auth page", () => {
  it("renders login form when not authenticated", async () => {
    const Auth = (await import("../Auth")).default;
    render(<W><Auth /></W>);
    expect(screen.getByText("auth.welcomeBack")).toBeInTheDocument();
  });

  it("has email and password inputs", async () => {
    const Auth = (await import("../Auth")).default;
    render(<W><Auth /></W>);
    expect(screen.getByLabelText("auth.email")).toBeInTheDocument();
    expect(screen.getByLabelText("auth.password")).toBeInTheDocument();
  });
});
