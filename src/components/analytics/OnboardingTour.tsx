import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, MousePointer2, Clock, LayoutTemplate, Users, ChevronRight, ChevronLeft } from "lucide-react";

const STORAGE_KEY = "aicono.analytics-studio.onboarding.v1";

const STEPS = [
  {
    icon: LayoutTemplate,
    title: "Willkommen im Analytics Studio",
    body: "Baue dein persönliches Energie-Labor: Ziehe Geräte auf die Fläche, kombiniere sie zu Blöcken und speichere ganze Arbeitsbereiche.",
  },
  {
    icon: MousePointer2,
    title: "Geräte per Drag & Drop",
    body: "Öffne die Bibliothek links. Ziehe einen Zähler oder Sensor auf die Fläche — es entsteht automatisch ein Zeitreihen-Block. Weitere Geräte kannst du direkt auf bestehende Blöcke ziehen.",
  },
  {
    icon: Clock,
    title: "Zeitraum & Vergleich",
    body: "Oben stellst du den globalen Zeitraum ein (Tag/Woche/Monat/Jahr). Blöcke wie „Vergleich" nutzen zusätzlich einen Zeitversatz (heute vs. gestern, Woche vs. Vorwoche).",
  },
  {
    icon: Sparkles,
    title: "KI & Story-Modus",
    body: "Der Block „KI-Erklärung" analysiert deine Daten automatisch und beantwortet „Was ist hier passiert?". Mit dem Story-Modus baust du eine Präsentation aus mehreren Ansichten.",
  },
  {
    icon: Users,
    title: "Vorlagen & Teilen",
    body: "Nutze die Vorlagen-Galerie („Neu aus Vorlage") für einen schnellen Start. Fertige Workspaces kannst du tenantweit freigeben oder gezielt mit einzelnen Kolleg:innen teilen.",
  },
];

export function OnboardingTour({ forceOpen = false, onClose }: { forceOpen?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (forceOpen) {
      setStep(0);
      setOpen(true);
      return;
    }
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        setOpen(true);
      }
    } catch {
      // ignore
    }
  }, [forceOpen]);

  const close = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // ignore
    }
    setOpen(false);
    onClose?.();
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle>{current.title}</DialogTitle>
              <DialogDescription className="text-[10px] uppercase tracking-wide">
                Schritt {step + 1} von {STEPS.length}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <p className="text-sm text-muted-foreground leading-relaxed">{current.body}</p>

        <div className="flex items-center justify-center gap-1.5 pt-1">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
            />
          ))}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={close}>
            Überspringen
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Zurück
              </Button>
            )}
            <Button size="sm" onClick={() => (isLast ? close() : setStep((s) => s + 1))}>
              {isLast ? "Los geht's" : (<>Weiter <ChevronRight className="h-4 w-4 ml-1" /></>)}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
