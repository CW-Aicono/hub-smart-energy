import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useDemoMode } from "@/contexts/DemoMode";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isRecovery: boolean;
  clearRecovery: () => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null; data: { user: User | null } | null }>;
  signOut: () => Promise<void>;
}

const RECOVERY_KEY = "seh_recovery_pending";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const isDemo = useDemoMode();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(() => sessionStorage.getItem(RECOVERY_KEY) === "1");

  const clearRecovery = useCallback(() => {
    sessionStorage.removeItem(RECOVERY_KEY);
    setIsRecovery(false);
  }, []);

  useEffect(() => {
    if (isDemo) {
      setUser({
        id: "demo-user-id",
        email: "demo@smartenergy.de",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: "2025-01-01T00:00:00Z",
      } as User);
      setSession({ access_token: "demo-token" } as Session);
      setLoading(false);
      return () => {
        setUser(null);
        setSession(null);
        setLoading(true);
      };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          sessionStorage.setItem(RECOVERY_KEY, "1");
          setIsRecovery(true);
        }
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [isDemo]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    });
    return { error: error as Error | null, data: data ? { user: data.user } : null };
  };

  const signOut = async () => {
    if (isDemo) return;
    clearRecovery();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isRecovery, clearRecovery, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}