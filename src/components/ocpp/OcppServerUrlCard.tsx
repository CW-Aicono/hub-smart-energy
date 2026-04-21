import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Copy, Server, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const SELF_HOSTED_KEY = "ocpp_self_hosted_url";
const MODE_KEY = "ocpp_server_mode";

type Mode = "cloud" | "self";

interface Props {
  cloudUrl: string;
}

export const OcppServerUrlCard = ({ cloudUrl }: Props) => {
  const [mode, setMode] = useState<Mode>("cloud");
  const [selfUrl, setSelfUrl] = useState("");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const m = (localStorage.getItem(MODE_KEY) as Mode) || "cloud";
    const u = localStorage.getItem(SELF_HOSTED_KEY) || "";
    setMode(m);
    setSelfUrl(u);
    setDraft(u);
  }, []);

  const saveSelf = () => {
    let u = draft.trim().replace(/\/+$/, "");
    if (u && !/^wss?:\/\//.test(u)) u = `wss://${u}`;
    localStorage.setItem(SELF_HOSTED_KEY, u);
    setSelfUrl(u);
    toast({ title: "Server-URL gespeichert" });
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    localStorage.setItem(MODE_KEY, m);
  };

  const activeUrl = mode === "self" && selfUrl ? selfUrl : cloudUrl;

  const copy = (url: string) => {
    navigator.clipboard.writeText(`${url}/{OCPP_ID}`);
    toast({ title: "Kopiert!" });
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-start gap-2">
          <Server className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">OCPP-Server-Auswahl</p>
            <p className="text-[11px] text-muted-foreground">
              Lovable Cloud (serverless) oder eigener persistenter Server (empfohlen für Dauerbetrieb).
            </p>
          </div>
        </div>

        <RadioGroup value={mode} onValueChange={(v) => switchMode(v as Mode)} className="space-y-2">
          <div className="flex items-start gap-2 p-2 rounded-md border bg-background">
            <RadioGroupItem value="cloud" id="m-cloud" className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <Label htmlFor="m-cloud" className="text-xs font-medium cursor-pointer">
                Lovable Cloud
              </Label>
              <p className="text-[11px] text-muted-foreground mb-1.5">
                Serverless Edge-Endpunkt. Einfach, aber Worker-Recycling kann lange WS-Sessions trennen.
              </p>
              <div className="flex items-center gap-1.5">
                <code className="text-[11px] bg-muted border rounded px-2 py-1 break-all select-all flex-1">
                  {cloudUrl}/{"<OCPP_ID>"}
                </code>
                <Button variant="outline" size="icon" className="shrink-0 h-7 w-7" onClick={() => copy(cloudUrl)}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 p-2 rounded-md border bg-background">
            <RadioGroupItem value="self" id="m-self" className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <Label htmlFor="m-self" className="text-xs font-medium cursor-pointer">
                Eigener Server (persistent, empfohlen)
              </Label>
              <p className="text-[11px] text-muted-foreground mb-1.5">
                Dauerhafter OCPP-Server (z. B. Hetzner). Siehe Anleitung in <code>docs/ocpp-persistent-server/</code>.
              </p>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Input
                  placeholder="ocpp.deine-domain.de"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="h-7 text-xs"
                />
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveSelf}>
                  Speichern
                </Button>
              </div>
              {selfUrl && (
                <div className="flex items-center gap-1.5">
                  <code className="text-[11px] bg-muted border rounded px-2 py-1 break-all select-all flex-1 font-semibold">
                    {selfUrl}/{"<OCPP_ID>"}
                  </code>
                  <Button variant="outline" size="icon" className="shrink-0 h-7 w-7" onClick={() => copy(selfUrl)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </RadioGroup>

        <div className="flex items-center gap-1.5 p-2 rounded-md bg-primary/10 border border-primary/20">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <p className="text-[11px]">
            Aktiv für Wallbox-Konfiguration:{" "}
            <code className="font-semibold">{activeUrl}/{"<OCPP_ID>"}</code>
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
