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
import { Copy, Check, Download, ExternalLink } from "lucide-react";
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
              {copied ? "Kopiert" : "Link kopieren"}
            </Button>
            <Button variant="outline" className="flex-1 gap-1.5" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Herunterladen
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center break-all">{appUrl}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
