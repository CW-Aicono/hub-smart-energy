import { toast } from "sonner";
import { formatAppVersion, formatAppVersionDetails } from "@/lib/appVersion";

export function AppVersionLabel({ className = "" }: { className?: string }) {
  const details = formatAppVersionDetails();
  return (
    <button
      type="button"
      title={`${details}\n(Klicken zum Kopieren)`}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(details).then(() => toast.success("Version kopiert"));
      }}
      className={`text-[11px] text-muted-foreground hover:text-foreground truncate ${className}`}
    >
      {formatAppVersion()}
    </button>
  );
}
