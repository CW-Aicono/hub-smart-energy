import { Info } from "lucide-react";
import { Link } from "react-router-dom";

interface AiDisclaimerProps {
  text: string;
  showAgbLink?: boolean;
}

export function AiDisclaimer({ text, showAgbLink = true }: AiDisclaimerProps) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-muted/40 border border-border/50 px-3 py-2 mt-3">
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {text}
        {showAgbLink && (
          <>
            {" "}
            <Link to="/agb" className="underline hover:text-foreground">
              Nutzungsbedingungen
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
