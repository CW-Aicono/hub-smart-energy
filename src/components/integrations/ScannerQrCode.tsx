import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { MeterScanner } from "@/hooks/useMeterScanners";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, ExternalLink, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ScannerQrCodeProps {
  scanner: MeterScanner;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScannerQrCode({ scanner, open, onOpenChange }: ScannerQrCodeProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const appUrl = `${window.location.origin}/m?scanner=${scanner.id}`;

  useEffect(() => {
    if (open) {
      QRCode.toDataURL(appUrl, {
        width: 400,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).then(setQrDataUrl);
    }
  }, [open, appUrl]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(appUrl);
    setCopied(true);
    toast({ title: "Link kopiert" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.download = `scanner-${scanner.name.replace(/\s+/g, "-").toLowerCase()}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>QR-Code: ${scanner.name}</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 40px; }
        img { width: 250px; height: 250px; }
        h2 { margin-bottom: 4px; }
        p { color: #666; font-size: 14px; margin-top: 4px; }
        @media print { button { display: none; } }
      </style></head><body>
      <h2>${scanner.name}</h2>
      <p>Scan-App öffnen</p>
      <img src="${qrDataUrl}" alt="QR-Code" />
      <p style="font-size:11px; word-break:break-all;">${appUrl}</p>
      <p>Smart Energy Hub</p>
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
          <DialogTitle>QR-Code: {scanner.name}</DialogTitle>
          <DialogDescription>
            Scannen Sie diesen QR-Code mit einem Smartphone, um die Zähler-App zu öffnen.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {qrDataUrl && (
            <img src={qrDataUrl} alt="QR-Code" className="w-64 h-64 rounded-lg border" />
          )}
          <div className="flex gap-2 w-full">
            <Button variant="outline" className="flex-1 gap-1.5" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Kopiert" : "Link"}
            </Button>
            <Button variant="outline" className="flex-1 gap-1.5" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Download
            </Button>
            <Button variant="outline" className="flex-1 gap-1.5" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              Drucken
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center break-all">{appUrl}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
