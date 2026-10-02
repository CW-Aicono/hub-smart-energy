import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve?: (value: boolean) => void;
}

let setStateRef: ((s: ConfirmState) => void) | null = null;

/**
 * Imperative confirm dialog as a replacement for window.confirm().
 * Returns a Promise<boolean>. Requires <ConfirmDialogHost /> to be mounted.
 */
export function confirmDialog(options: ConfirmOptions | string): Promise<boolean> {
  const opts: ConfirmOptions =
    typeof options === "string" ? { description: options } : options;
  return new Promise((resolve) => {
    if (!setStateRef) {
      // Fallback if host not mounted
      resolve(window.confirm(opts.description || opts.title || "Fortfahren?"));
      return;
    }
    setStateRef({ ...opts, open: true, resolve });
  });
}

export function ConfirmDialogHost() {
  const [state, setState] = useState<ConfirmState>({ open: false });

  useEffect(() => {
    setStateRef = setState;
    return () => {
      setStateRef = null;
    };
  }, []);

  const handle = (result: boolean) => {
    state.resolve?.(result);
    setState({ ...state, open: false, resolve: undefined });
  };

  return (
    <AlertDialog open={state.open} onOpenChange={(o) => !o && handle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title ?? "Bestätigen"}</AlertDialogTitle>
          {state.description && (
            <AlertDialogDescription>{state.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => handle(false)}>
            {state.cancelLabel ?? "Abbrechen"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => handle(true)}
            className={cn(
              state.destructive !== false &&
                buttonVariants({ variant: "destructive" }),
            )}
          >
            {state.confirmLabel ?? "Löschen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
