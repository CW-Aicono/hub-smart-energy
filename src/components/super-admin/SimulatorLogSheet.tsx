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
      const state = query.state.data as { notFound?: boolean; unavailable?: boolean } | undefined;
      if (state?.notFound || state?.unavailable) return false;
      return open ? 10000 : false;
    },
    retry: false,
    queryFn: async () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpp-simulator-control?action=logs&instanceId=${instanceId}`;
      const session = (await supabase.auth.getSession()).data.session;
      const headers = {
        Authorization: `Bearer ${session?.access_token ?? ""}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      };
      // Retry transient 5xx (e.g. 503 SUPABASE_EDGE_RUNTIME_ERROR)
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(url, { method: "GET", headers });
          if (res.status === 404) {
            return { logs: [], unavailable: true, notFound: true };
          }
          if (res.status >= 500 && res.status < 600 && attempt < 2) {
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            continue;
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
          if (attempt === 2) return { logs: [], unavailable: true, notFound: false };
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
      return { logs: [], unavailable: true, notFound: false };
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
          ) : notFound ? (
            <div className="py-12 text-center text-sm text-muted-foreground px-6">
              Diese Simulator-Sitzung wurde beendet.
              <br />
              Starte den Simulator neu, um wieder Live-Logs zu sehen.
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
