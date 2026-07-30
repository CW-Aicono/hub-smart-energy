import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw, RotateCcw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { describeError } from "@/lib/errorMessages";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  /** Optional: Originalfehler – Titel/Text werden daraus abgeleitet und übersetzt. */
  error?: unknown;
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Einheitliches Error-Pattern für fehlgeschlagene Queries.
 * Zeigt eine verständliche, übersetzte Meldung statt technischem Text,
 * bietet "Erneut versuchen" und – nach dem zweiten Fehlversuch – "Seite neu laden".
 */
export function QueryErrorState({ error, title, message, onRetry, className }: Props) {
  const { t } = useTranslation();
  const [attempts, setAttempts] = useState(0);
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const described = error !== undefined ? describeError(error) : undefined;

  const shownTitle = title ?? described?.title ?? t("error.unknown.title");
  const shownMessage = message ?? described?.description ?? t("error.unknown.desc");

  const handleRetry = () => {
    setAttempts((a) => a + 1);
    onRetry?.();
  };

  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
          {offline ? (
            <WifiOff className="h-6 w-6 text-destructive" />
          ) : (
            <AlertCircle className="h-6 w-6 text-destructive" />
          )}
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{shownTitle}</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {offline ? `${t("error.offline.hint")} ${shownMessage}` : shownMessage}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <Button variant="outline" size="sm" onClick={handleRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t("error.action.retry")}
            </Button>
          )}
          {(attempts >= 2 || !onRetry) && (
            <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
              <RotateCcw className="h-4 w-4 mr-2" />
              {t("error.action.reload")}
            </Button>
          )}
        </div>
        {described && (
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            {t("error.code.label")}: {described.code}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default QueryErrorState;
