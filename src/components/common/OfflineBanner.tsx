import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Dezenter globaler Banner bei fehlender Internetverbindung.
 * Lädt bei Rückkehr automatisch alle aktiven Abfragen neu.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      queryClient.invalidateQueries();
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [queryClient]);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-md"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>{t("error.offline.banner")}</span>
    </div>
  );
}

export default OfflineBanner;
