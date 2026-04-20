import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QrCode, Printer } from "lucide-react";
import QRCode from "qrcode";

interface ChargePointQrCodeProps {
  ocppId: string;
  name: string;
  address?: string | null;
  /** Optional connector ID – when set, the QR code deep-links to that specific connector */
  connectorId?: number;
  /** Custom connector name for display */
  connectorName?: string;
  /** Variant: "icon" renders as icon button, "button" as full button */
  variant?: "icon" | "button";
}

export default function ChargePointQrCode({ ocppId, name, address, connectorId, connectorName, variant = "icon" }: ChargePointQrCodeProps) {
  const [open, setOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appUrl = `${window.location.origin}/ev?cp=${encodeURIComponent(ocppId)}${connectorId ? `&conn=${connectorId}` : ""}`;
  const connLabel = connectorName || (connectorId ? `Anschluss ${connectorId}` : null);
  const displayName = connLabel ? `${name} – ${connLabel}` : name;

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (canvasRef.current) {
        QRCode.toCanvas(canvasRef.current, appUrl, {
          width: 280,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [open, appUrl]);

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // Generate QR code as data URL for print
    QRCode.toDataURL(appUrl, { width: 400, margin: 2 }).then((dataUrl) => {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>QR-Code: ${displayName}</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 40px; }
            .qr-container { display: inline-block; border: 2px solid #e5e7eb; border-radius: 16px; padding: 32px; }
            h1 { font-size: 24px; margin: 0 0 4px; }
            .address { font-size: 14px; color: #6b7280; margin: 0 0 24px; }
            img { display: block; margin: 0 auto 16px; }
            .hint { font-size: 12px; color: #9ca3af; margin-top: 16px; }
            .ocpp-id { font-family: monospace; font-size: 13px; color: #374151; background: #f3f4f6; padding: 4px 12px; border-radius: 6px; display: inline-block; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="qr-container">
            <h1>${displayName}</h1>
            ${address ? `<p class="address">${address}</p>` : '<p class="address">&nbsp;</p>'}
            <img src="${dataUrl}" width="300" height="300" />
            <div class="ocpp-id">${ocppId}</div>
            <p class="hint">QR-Code scannen, um den Ladevorgang zu starten</p>
          </div>
        </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 300);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <Button variant="ghost" size="icon" title="QR-Code anzeigen">
            <QrCode className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <QrCode className="h-4 w-4 mr-2" />{connLabel || "QR-Code"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">QR-Code: {displayName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-4">
          {address && <p className="text-sm text-muted-foreground">{address}</p>}
          <canvas ref={canvasRef} className="rounded-lg" />
          <p className="text-xs text-muted-foreground text-center">
            Nutzer können diesen QR-Code mit der Lade-App scannen, um einen Ladevorgang zu starten.
          </p>
          <code className="text-xs bg-muted px-3 py-1.5 rounded-md">{ocppId}</code>
          <Button className="w-full" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" /> QR-Code drucken
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
