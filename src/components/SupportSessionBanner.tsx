import { useSupportSession } from "@/hooks/useSupportSession";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { ShieldAlert, RefreshCw } from "lucide-react";

export default function SupportSessionBanner() {
  const { isActive, secondsLeft, showCountdown, extendSession } = useSupportSession();
  const { t } = useTranslation();

  if (!isActive) return null;

  const mins = Math.floor((secondsLeft ?? 0) / 60);
  const secs = (secondsLeft ?? 0) % 60;
  const timeStr = showCountdown
    ? `${secs}s`
    : `${mins}:${secs.toString().padStart(2, "0")}`;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-destructive text-destructive-foreground px-4 pb-3 flex items-center justify-center gap-4 shadow-lg animate-in slide-in-from-top-2" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span className="text-sm font-semibold">
        {t("support_banner.active" as any)}
      </span>
      <span className="text-sm tabular-nums font-mono">
        {timeStr}
      </span>
      {showCountdown && (
        <Button
          size="sm"
          variant="secondary"
          onClick={extendSession}
          className="h-7 text-xs gap-1"
        >
          <RefreshCw className="h-3 w-3" />
          {t("support_banner.extend" as any)}
        </Button>
      )}
    </div>
  );
}
