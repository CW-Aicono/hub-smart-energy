import { useEffect } from "react";
import { Smartphone, Share, Plus, MoreVertical } from "lucide-react";
import { SharingLayout } from "@/components/sharing/SharingLayout";

export default function SharingInstall() {
  useEffect(() => {
    document.title = "App installieren — Meine Energie-Community";
    // Manifest für Install-Prompt aktiv setzen
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const prev = link?.getAttribute("href") ?? null;
    if (link) link.setAttribute("href", "/manifest-sharing.json");
    return () => {
      if (link && prev) link.setAttribute("href", prev);
    };
  }, []);

  return (
    <SharingLayout title="App auf Handy installieren">
      <div className="space-y-4">
        <div className="rounded-lg border bg-card p-5 space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <Smartphone className="h-5 w-5 text-primary" /> So funktioniert's
          </div>
          <p className="text-sm text-muted-foreground">
            Du kannst diese Seite wie eine echte App auf deinen Startbildschirm legen. Sie öffnet
            sich dann im Vollbild ohne Browser-Leiste.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-5 space-y-3">
          <div className="font-medium">iPhone / iPad (Safari)</div>
          <ol className="text-sm space-y-2 list-decimal pl-5 text-muted-foreground">
            <li>
              Öffne diese Seite in <span className="font-medium text-foreground">Safari</span>{" "}
              (nicht Chrome).
            </li>
            <li>
              Tippe unten in der Menüleiste auf das Teilen-Symbol{" "}
              <Share className="inline h-4 w-4 align-text-bottom" />.
            </li>
            <li>
              Wähle „<span className="font-medium text-foreground">Zum Home-Bildschirm</span>"{" "}
              <Plus className="inline h-4 w-4 align-text-bottom" />.
            </li>
            <li>Bestätige mit „Hinzufügen" oben rechts.</li>
          </ol>
        </div>

        <div className="rounded-lg border bg-card p-5 space-y-3">
          <div className="font-medium">Android (Chrome)</div>
          <ol className="text-sm space-y-2 list-decimal pl-5 text-muted-foreground">
            <li>Öffne diese Seite in Chrome.</li>
            <li>
              Tippe oben rechts auf das Menü{" "}
              <MoreVertical className="inline h-4 w-4 align-text-bottom" />.
            </li>
            <li>
              Wähle „<span className="font-medium text-foreground">App installieren</span>" oder
              „Zum Startbildschirm hinzufügen".
            </li>
            <li>Bestätige mit „Installieren".</li>
          </ol>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Tipp: Nach der Installation öffnest du die App über das neue Symbol auf deinem
          Startbildschirm.
        </p>
      </div>
    </SharingLayout>
  );
}
