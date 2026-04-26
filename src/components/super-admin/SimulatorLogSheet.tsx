import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowDown, ArrowUp } from "lucide-react";
import { format } from "date-fns";

interface OcppLogEntry {
  ts: string;
  dir: "in" | "out";
  action: string;
  payload: unknown;
}

interface Props {
  instanceId: string | null;
  ocppId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SimulatorLogSheet({ instanceId, ocppId, open, onOpenChange }: Props) {
  const { data, isFetching } = useQuery<{ logs: OcppLogEntry[]; unavailable: boolean; notFound: boolean }>({
    queryKey: ["simulator-logs", instanceId],
    enabled: !!instanceId && open,
    refetchInterval: (query) => {
      // Stop polling once instance is gone — prevents repeated 404 toasts
      if ((query.state.data as { notFound?: boolean } | undefined)?.notFound) return false;
      return open ? 3000 : false;
    },
    retry: false,
    queryFn: async () => {
      // Direct fetch so we can inspect HTTP status (invoke throws on non-2xx and bubbles a toast)
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpp-simulator-control?action=logs&instanceId=${instanceId}`;
      const session = (await supabase.auth.getSession()).data.session;
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session?.access_token ?? ""}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          },
        });
        if (res.status === 404) {
          // Instance gone (e.g. after Stop Tx or container restart) — stop polling
          return { logs: [], unavailable: true, notFound: true };
        }
        if (!res.ok) {
          return { logs: [], unavailable: true, notFound: false };
        }
        const json = (await res.json()) as { logs?: OcppLogEntry[] };
        return {
          logs: (json.logs ?? []).slice().reverse(),
          unavailable: false,
          notFound: false,
        };
      } catch {
        return { logs: [], unavailable: true, notFound: false };
      }
    },
  });

  const logs = data?.logs ?? [];
  const unavailable = data?.unavailable ?? false;
  const notFound = data?.notFound ?? false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>OCPP Live-Log</SheetTitle>
          <SheetDescription>
            Letzte 50 Nachrichten — {ocppId ?? "—"} (auto-refresh alle 3s)
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 h-[calc(100vh-8rem)]">
          {isFetching && !data ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Logs werden geladen …
            </div>
          ) : unavailable ? (
            <div className="py-12 text-center text-sm text-muted-foreground px-6">
              Live-Logs sind noch nicht verfügbar.
              <br />
              Der Simulator-Container muss auf v1.1 aktualisiert werden
              (siehe <code>docs/ocpp-simulator-server/UPDATE_v1.1_ANLEITUNG.md</code>).
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Noch keine OCPP-Nachrichten in dieser Sitzung.
            </div>
          ) : (
            <ScrollArea className="h-full pr-4">
              <div className="space-y-2 font-mono text-xs">
                {logs.map((entry, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border border-border bg-muted/30 p-2"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {entry.dir === "in" ? (
                        <ArrowDown className="h-3 w-3 text-primary" />
                      ) : (
                        <ArrowUp className="h-3 w-3 text-accent-foreground" />
                      )}
                      <Badge variant="outline" className="text-xs">
                        {entry.action}
                      </Badge>
                      <span className="text-muted-foreground ml-auto">
                        {format(new Date(entry.ts), "HH:mm:ss")}
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap break-all text-muted-foreground">
                      {JSON.stringify(entry.payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
