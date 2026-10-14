import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { KeyRound, Copy, Check, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { validatePassword } from "@/lib/passwordPolicy";

/** Erzeugt ein gut diktierbares Zufallspasswort (ohne 0/O/1/l). */
function generatePassword(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = letters + digits;
  const rnd = (n: number) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  };
  const chars = Array.from({ length: 10 }, () => all[rnd(all.length)]);
  chars[rnd(10)] = digits[rnd(digits.length)];
  chars[(rnd(9) + 1) % 10] = letters[rnd(letters.length)];
  const pw = chars.join("");
  return /\d/.test(pw) && /[A-Za-z]/.test(pw) ? pw : pw.slice(0, 8) + "a7";
}

interface Target {
  userId?: string;
  email?: string | null;
  label?: string | null;
}

interface Props extends Target {
  /** Rendert einen kleinen Schlüssel-Knopf; Dialog öffnet beim Klick. */
  disabled?: boolean;
}

/**
 * „Startpasswort vergeben": Der Admin setzt ein Passwort, gibt es selbst weiter,
 * und der Nutzer muss es bei der ersten Anmeldung ändern. Die Berechtigung prüft der Server.
 */
export function SetTempPasswordButton({ userId, email, label, disabled }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => setOpen(true)}
            aria-label="Startpasswort vergeben"
          >
            <KeyRound className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Startpasswort vergeben</TooltipContent>
      </Tooltip>
      <SetTempPasswordDialog open={open} onOpenChange={setOpen} userId={userId} email={email} label={label} />
    </>
  );
}

/** Gesteuerter Dialog – z. B. aus einem Drei-Punkte-Menü heraus öffnen. */
export function SetTempPasswordDialog({
  open, onOpenChange, userId, email, label,
}: Target & { open: boolean; onOpenChange: (o: boolean) => void }) {
  const setOpen = onOpenChange;
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const reset = () => { setPassword(""); setDone(false); setCopied(false); };

  const submit = async () => {
    const invalid = validatePassword(password, password);
    if (invalid) { toast.error(invalid); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-set-temp-password", {
        body: { userId, email: userId ? undefined : email, password },
      });
      let payload: any = data;
      if (error && (error as any).context?.json) {
        try { payload = await (error as any).context.json(); } catch { /* ignore */ }
      }
      if (!payload?.success) throw new Error(payload?.error || (error as any)?.message || "Fehler");
      setDone(true);
      toast.success("Startpasswort gesetzt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Startpasswort konnte nicht gesetzt werden");
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("Kopieren nicht möglich"); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Startpasswort vergeben</DialogTitle>
            <DialogDescription>
              Für <strong>{label || email}</strong>. Das Passwort wird nicht per E-Mail verschickt –
              bitte selbst weitergeben (z. B. telefonisch). Bei der ersten Anmeldung muss ein eigenes
              Passwort festgelegt werden. Offene Einladungslinks werden dabei gesperrt.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="temp-pw">Startpasswort</Label>
            <div className="flex gap-2">
              <Input
                id="temp-pw"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mind. 8 Zeichen, Buchstabe und Ziffer"
                autoComplete="off"
                disabled={done}
                className="font-mono"
              />
              <Button type="button" variant="outline" size="icon" onClick={copy} disabled={!password} aria-label="Kopieren">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            {!done && (
              <Button type="button" variant="link" className="px-0 h-auto" onClick={() => setPassword(generatePassword())}>
                <Wand2 className="h-3.5 w-3.5 mr-1" /> Zufällig erzeugen
              </Button>
            )}
            {done && (
              <p className="text-sm text-muted-foreground">
                Gespeichert. Bitte das Passwort jetzt kopieren und weitergeben – es wird nicht erneut angezeigt.
              </p>
            )}
          </div>

          <DialogFooter>
            {done ? (
              <Button onClick={() => setOpen(false)}>Fertig</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
                <Button onClick={submit} disabled={saving || password.length < 8}>
                  {saving ? "Wird gespeichert …" : "Startpasswort setzen"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default SetTempPasswordButton;
