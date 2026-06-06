import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Einheitliches Error-Pattern für fehlgeschlagene Queries.
 * Zeigt Icon, Fehlermeldung und (optional) Retry-Button statt leerer UI.
 */
export function QueryErrorState({
  title = "Daten konnten nicht geladen werden",
  message = "Es ist ein Fehler aufgetreten. Bitte versuche es erneut.",
  onRetry,
  className,
}: Props) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">{message}</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
            <RefreshCw className="h-4 w-4 mr-2" />
            Erneut versuchen
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default QueryErrorState;
