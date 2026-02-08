import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Zap } from "lucide-react";
import { z } from "zod";

const authSchema = z.object({
  email: z.string().email("Bitte geben Sie eine gültige E-Mail-Adresse ein"),
  password: z.string().min(6, "Passwort muss mindestens 6 Zeichen lang sein"),
});

const Auth = () => {
  const { user, loading } = useAuth();
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Laden...</div>
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = authSchema.safeParse({ email, password });
    if (!result.success) {
      toast({ title: "Fehler", description: result.error.errors[0].message, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const { error } = isLogin ? await signIn(email, password) : await signUp(email, password);
    setSubmitting(false);

    if (error) {
      let message = error.message;
      if (message.includes("Invalid login")) message = "Ungültige E-Mail oder Passwort";
      if (message.includes("already registered")) message = "Diese E-Mail ist bereits registriert";
      toast({ title: "Fehler", description: message, variant: "destructive" });
    } else if (!isLogin) {
      toast({ title: "Registrierung erfolgreich", description: "Bitte bestätigen Sie Ihre E-Mail-Adresse." });
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12">
        <div className="max-w-md text-primary-foreground">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-12 w-12 rounded-lg bg-accent flex items-center justify-center">
              <Zap className="h-7 w-7 text-accent-foreground" />
            </div>
            <h1 className="text-3xl font-display font-bold">Smart Energy Hub</h1>
          </div>
          <p className="text-lg opacity-80 leading-relaxed">
            Ihr intelligentes B2B-Dashboard für Energiemanagement. Verbrauch analysieren, Kosten optimieren und Nachhaltigkeitsziele erreichen.
          </p>
        </div>
      </div>

      {/* Right auth form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8 bg-background">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2 lg:hidden">
              <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center">
                <Zap className="h-5 w-5 text-accent-foreground" />
              </div>
              <span className="text-xl font-display font-bold">Smart Energy Hub</span>
            </div>
            <CardTitle className="text-2xl font-display">
              {isLogin ? "Willkommen zurück" : "Konto erstellen"}
            </CardTitle>
            <CardDescription>
              {isLogin ? "Melden Sie sich an, um fortzufahren" : "Erstellen Sie Ihr Unternehmenskonto"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@unternehmen.de"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Laden..." : isLogin ? "Anmelden" : "Registrieren"}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {isLogin ? "Noch kein Konto?" : "Bereits registriert?"}{" "}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-accent hover:underline font-medium"
              >
                {isLogin ? "Jetzt registrieren" : "Anmelden"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
