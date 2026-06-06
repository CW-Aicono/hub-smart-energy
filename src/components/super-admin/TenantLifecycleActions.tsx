import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { Lock, Unlock, Archive } from "lucide-react";
import { useTenants } from "@/hooks/useTenants";

interface Props {
  tenant: { id: string; name: string; status?: string | null };
}

export function TenantStatusBadge({ status }: { status?: string | null }) {
  if (!status || status === "active") return <Badge variant="default">Aktiv</Badge>;
  if (status === "suspended") return <Badge variant="destructive">Gesperrt</Badge>;
  if (status === "deleted") return <Badge variant="outline">Gelöscht</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export default function TenantLifecycleActions({ tenant }: Props) {
  const { suspendTenant, reactivateTenant, softDeleteTenant } = useTenants();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [reason, setReason] = useState("");

  const status = tenant.status ?? "active";

  return (
    <>
      {status === "active" && (
        <Button
          variant="ghost"
          size="icon"
          title="Mandant sperren"
          onClick={(e) => {
            e.stopPropagation();
            setReason("");
            setSuspendOpen(true);
          }}
        >
          <Lock className="h-4 w-4" />
        </Button>
      )}
      {status === "suspended" && (
        <Button
          variant="ghost"
          size="icon"
          title="Mandant reaktivieren"
          onClick={(e) => {
            e.stopPropagation();
            reactivateTenant.mutate(tenant.id);
          }}
        >
          <Unlock className="h-4 w-4" />
        </Button>
      )}
      {status !== "deleted" && (
        <Button
          variant="ghost"
          size="icon"
          title="In Papierkorb verschieben"
          onClick={(e) => {
            e.stopPropagation();
            setArchiveOpen(true);
          }}
        >
          <Archive className="h-4 w-4" />
        </Button>
      )}

      {/* Suspend dialog */}
      <AlertDialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mandant „{tenant.name}" sperren?</AlertDialogTitle>
            <AlertDialogDescription>
              Gesperrte Mandanten können sich nicht mehr anmelden. Der Zugang kann jederzeit
              reaktiviert werden. Optionaler Grund wird Admins angezeigt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Grund (optional, z. B. offene Rechnung)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => suspendTenant.mutate({ id: tenant.id, reason })}
            >
              Sperren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Soft-delete dialog */}
      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mandant „{tenant.name}" archivieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Mandant wird als „gelöscht" markiert und kann sich nicht mehr anmelden.
              Datensätze bleiben erhalten und können bei Bedarf wiederhergestellt werden.
              Für eine endgültige Löschung nutzen Sie den Löschen-Button.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => softDeleteTenant.mutate(tenant.id)}>
              Archivieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
