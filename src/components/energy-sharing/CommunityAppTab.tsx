import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Copy, Check, ExternalLink, Smartphone, Printer, AlertTriangle, LayoutDashboard, FileText, UserCog, Sun } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  communityId?: string;
}

export default function CommunityAppTab({ communityId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const appUrl = `${window.location.origin}/mein-sharing/dashboard`;
  const loginUrl = `${window.location.origin}/mein-sharing/login`;

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, loginUrl, {
        width: 260,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
    }
  }, [loginUrl]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(loginUrl);
    setCopied(true);
    toast({ title: "Link kopiert" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = async () => {
    const dataUrl = await QRCode.toDataURL(loginUrl, { width: 400, margin: 2 });
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>Community-App QR-Code</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px}img{width:300px;height:300px}h1{margin:0 0 4px}p{color:#666;font-size:14px}.url{font-family:monospace;font-size:12px;background:#f3f4f6;padding:6px 12px;border-radius:6px;display:inline-block;margin-top:8px;word-break:break-all}</style>
      </head><body>
      <h1>Meine Energie-Community</h1>
      <p>Mitglieder-App zum Anmelden</p>
      <img src="${dataUrl}" />
      <div class="url">${loginUrl}</div>
      <p>QR-Code mit dem Smartphone scannen</p>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" /> Community-App
          </CardTitle>
          <CardDescription>
            Diese PWA installieren deine Community-Mitglieder auf dem Smartphone. Sie sehen dort
            Übersicht, Rechnungen und können ihre Stammdaten pflegen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-4">
            <canvas ref={canvasRef} className="rounded-md" />
            <code className="text-xs bg-muted px-3 py-1.5 rounded-md break-all max-w-full">
              {loginUrl}
            </code>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? "Kopiert" : "Link kopieren"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" /> Drucken
            </Button>
            <Button asChild className="flex-1">
              <a href={loginUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" /> Öffnen
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Hinweis: Mitglieder melden sich mit ihrer hinterlegten E-Mail-Adresse an. Für die
            Installation als App: in Safari/Chrome öffnen → „Zum Home-Bildschirm hinzufügen".
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Vorschau</CardTitle>
          <CardDescription>
            So sieht die App auf einem Smartphone aus (3 Bereiche: Übersicht, Rechnungen, Stammdaten).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="default" className="border-yellow-500/40 bg-yellow-500/5">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertTitle className="text-sm">Wichtig zum Testen</AlertTitle>
            <AlertDescription className="text-xs space-y-1">
              <p>
                Die Mitglieder-App und dieses Admin-Backend laufen unter derselben Domain und teilen
                sich die Anmeldung. Wenn du dich hier als Admin anmeldest und dann die App öffnest,
                bist du dort automatisch als Admin (nicht als Mitglied) angemeldet — und siehst die
                Meldung „Kein Mitgliedschafts-Zugang".
              </p>
              <p className="font-medium pt-1">Zum Testen empfohlen:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>QR-Code mit deinem Smartphone scannen, oder</li>
                <li>App in einem Inkognito-/Privat-Fenster öffnen, oder</li>
                <li>In einem anderen Browser öffnen.</li>
              </ul>
              <p className="pt-1 text-muted-foreground">
                Andernfalls musst du dich erst hier abmelden — dann verschwinden vorübergehend die
                Communities, bis du dich wieder als Admin anmeldest.
              </p>
            </AlertDescription>
          </Alert>

          <div className="mx-auto flex justify-center">
            <div className="relative rounded-[2.5rem] border-8 border-foreground/80 bg-foreground/80 shadow-2xl">
              <div className="absolute left-1/2 top-2 z-10 h-4 w-24 -translate-x-1/2 rounded-full bg-foreground/90" />
              <div
                className="flex flex-col rounded-[2rem] bg-background overflow-hidden"
                style={{ width: 280, height: 560 }}
              >
                {/* Safe area mock */}
                <div className="h-7 bg-background" />
                {/* Header */}
                <div className="border-b bg-card px-4 py-3 flex items-center gap-2">
                  <Sun className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Meine Energie-Community</span>
                </div>
                {/* Content placeholder */}
                <div className="flex-1 p-4 space-y-3">
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Mein Anteil (Monat)</div>
                    <div className="text-2xl font-semibold text-primary">142 kWh</div>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Ersparnis</div>
                    <div className="text-lg font-medium">28,40 €</div>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Nächste Rechnung</div>
                    <div className="text-sm">01.07.2026</div>
                  </div>
                </div>
                {/* Bottom nav */}
                <div className="border-t bg-card grid grid-cols-3">
                  <div className="flex flex-col items-center gap-1 py-2 text-[10px] text-primary">
                    <LayoutDashboard className="h-4 w-4" />
                    <span>Übersicht</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 py-2 text-[10px] text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span>Rechnungen</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 py-2 text-[10px] text-muted-foreground">
                    <UserCog className="h-4 w-4" />
                    <span>Stammdaten</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="text-center">
            <Button variant="link" asChild>
              <a href={appUrl} target="_blank" rel="noreferrer">
                Echte App in neuem Tab öffnen <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
