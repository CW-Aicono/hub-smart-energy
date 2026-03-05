import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Cookie, ChevronDown, ChevronUp } from "lucide-react";

const COOKIE_CONSENT_KEY = "cookie_consent";

type ConsentState = "accepted" | "rejected" | null;

const CookieConsent = () => {
  const [consent, setConsent] = useState<ConsentState>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(COOKIE_CONSENT_KEY) as ConsentState;
    if (!stored) {
      // Slight delay so it doesn't flash on initial load
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    } else {
      setConsent(stored);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    setConsent("accepted");
    setVisible(false);
  };

  const handleReject = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "rejected");
    setConsent("rejected");
    setVisible(false);
  };

  if (!visible || consent !== null) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 animate-in slide-in-from-bottom-4 duration-500"
      role="dialog"
      aria-label="Cookie-Einwilligung"
    >
      <div className="max-w-4xl mx-auto bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0 h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
              <Cookie className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-foreground mb-1">
                Datenschutz & Cookies
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Wir verwenden Cookies und ähnliche Technologien, um diese Website zu betreiben, 
                Ihnen die bestmögliche Nutzungserfahrung zu bieten und unsere Dienste kontinuierlich zu verbessern. 
                Einige Cookies sind technisch notwendig, während andere uns helfen, die Nutzung zu analysieren.
              </p>

              {/* Details toggle */}
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="mt-2 flex items-center gap-1 text-xs text-accent font-medium hover:underline"
              >
                {showDetails ? (
                  <>Weniger anzeigen <ChevronUp className="h-3 w-3" /></>
                ) : (
                  <>Details anzeigen <ChevronDown className="h-3 w-3" /></>
                )}
              </button>

              {showDetails && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 h-2 w-2 rounded-full bg-accent shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Notwendige Cookies</p>
                      <p className="text-xs text-muted-foreground">
                        Erforderlich für den Betrieb der Plattform (z. B. Anmeldung, Sitzungsverwaltung). Können nicht deaktiviert werden.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 h-2 w-2 rounded-full bg-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Analyse-Cookies</p>
                      <p className="text-xs text-muted-foreground">
                        Helfen uns zu verstehen, wie die Plattform genutzt wird, um sie weiter zu verbessern.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Legal links & action buttons */}
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 sm:justify-between">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Link to="/datenschutz" className="hover:underline">Datenschutzerklärung</Link>
              <span>·</span>
              <Link to="/impressum" className="hover:underline">Impressum</Link>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReject}
              className="text-muted-foreground"
            >
              Alle ablehnen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReject}
            >
              Nur notwendige
            </Button>
            <Button
              size="sm"
              onClick={handleAccept}
            >
              Alle akzeptieren
            </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
