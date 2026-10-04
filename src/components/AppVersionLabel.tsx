import { toast } from "sonner";
import { formatAppVersion } from "@/lib/appVersion";

export function AppVersionLabel({ className = "" }: { className?: string }) {
  const text = formatAppVersion();
  return (
    <button
      type="button"
      title="Version kopieren"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(text).then(() => toast.success("Version kopiert"));
      }}
      className={`text-[11px] text-muted-foreground hover:text-foreground font-mono truncate ${className}`}
    >
      {text}
    </button>
  );
}
