import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Meter } from "@/hooks/useMeters";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Copy, Check, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MeterQrCodeProps {
  meter: Meter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MeterQrCode({ meter, open, onOpenChange }: MeterQrCodeProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // Encode meter ID in QR code so the mobile app can identify it
  const qrPayload = JSON.stringify({ type: "meter", id: meter.id, number: meter.meter_number, name: meter.name });

  useEffect(() => {
    if (open) {
      QRCode.toDataURL(qrPayload, {
        width: 400,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).then(setQrDataUrl);
    }
  }, [open, qrPayload]);

  const handleDownload = () => {
    const link = document.createElement("a");
    link.download = `zaehler-${(meter.meter_number || meter.name).replace(/\s+/g, "-").toLowerCase()}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>QR-Code: ${meter.name}</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 40px; }
        img { width: 250px; height: 250px; }
        h2 { margin-bottom: 4px; }
        p { color: #666; font-size: 14px; margin-top: 4px; }
        @media print { button { display: none; } }
      </style></head><body>
      <h2>${meter.name}</h2>
      ${meter.meter_number ? `<p>Nr: ${meter.meter_number}</p>` : ""}
      <img src="${qrDataUrl}" alt="QR-Code" />
      <p>Smart Energy Hub – Zähler-QR-Code</p>
      <br/><button onclick="window.print()">Drucken</button>
      </body></html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 300);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>QR-Code: {meter.name}</DialogTitle>
          <DialogDescription>
            Drucken Sie diesen QR-Code aus und kleben Sie ihn an den Zähler. Die mobile App erkennt den Zähler automatisch.
            {meter.meter_number && (
              <span className="block mt-1 font-medium">Zählernummer: {meter.meter_number}</span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {qrDataUrl && (
            <img src={qrDataUrl} alt="QR-Code" className="w-64 h-64 rounded-lg border" />
          )}
          <div className="flex gap-2 w-full">
            <Button className="flex-1 gap-1.5" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Herunterladen
            </Button>
            <Button variant="outline" className="flex-1 gap-1.5" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              Drucken
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
