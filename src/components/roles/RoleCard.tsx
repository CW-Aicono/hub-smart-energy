import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Shield, ChevronDown, ChevronRight, Trash2, Lock } from "lucide-react";
import { CustomRole, Permission } from "@/hooks/useCustomRoles";
import { toast } from "sonner";

interface RoleCardProps {
  role: CustomRole;
  permissions: Permission[];
  permissionsByCategory: Record<string, Permission[]>;
  rolePermissions: string[];
  onTogglePermission: (roleId: string, permissionId: string) => Promise<{ error: Error | null }>;
  onDeleteRole: (id: string) => Promise<{ error: Error | null }>;
  isAdmin?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  locations: "Standorte",
  energy: "Energiedaten",
  reports: "Berichte",
  users: "Benutzerverwaltung",
  settings: "Einstellungen",
};

export function RoleCard({
  role,
  permissions,
  permissionsByCategory,
  rolePermissions,
  onTogglePermission,
  onDeleteRole,
  isAdmin = false,
}: RoleCardProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleTogglePermission = async (permissionId: string) => {
    if (isAdmin) return; // Admin role cannot be edited
    const { error } = await onTogglePermission(role.id, permissionId);
    if (error) {
      toast.error("Fehler beim Aktualisieren der Berechtigung");
    }
  };

  const handleDelete = async () => {
    const { error } = await onDeleteRole(role.id);
    if (error) {
      toast.error("Fehler beim Löschen der Rolle: " + error.message);
    } else {
      toast.success("Rolle erfolgreich gelöscht");
    }
  };

  const assignedCount = rolePermissions.length;
  const totalCount = permissions.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {role.name}
            {isAdmin && (
              <Lock className="h-4 w-4 text-muted-foreground" />
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {isAdmin ? "Alle" : `${assignedCount}/${totalCount}`} Rechte
            </Badge>
            {!isAdmin && !role.is_system_role && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Rolle löschen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Sind Sie sicher, dass Sie die Rolle "{role.name}" löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Löschen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
        {role.description && (
          <CardDescription>{role.description}</CardDescription>
        )}
        {isAdmin && (
          <CardDescription className="text-amber-600">
            Die Admin-Rolle hat automatisch alle Berechtigungen und kann nicht bearbeitet werden.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {Object.entries(permissionsByCategory).map(([category, categoryPermissions]) => (
            <Collapsible
              key={category}
              open={expandedCategories.has(category)}
              onOpenChange={() => toggleCategory(category)}
            >
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                  <span className="font-medium">
                    {CATEGORY_LABELS[category] || category}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {isAdmin 
                        ? categoryPermissions.length 
                        : categoryPermissions.filter((p) => rolePermissions.includes(p.id)).length
                      }/{categoryPermissions.length}
                    </Badge>
                    {expandedCategories.has(category) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </div>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-4 pt-2 space-y-2">
                {categoryPermissions.map((permission) => (
                  <div
                    key={permission.id}
                    className="flex items-center gap-3 py-1"
                  >
                    <Checkbox
                      id={`${role.id}-${permission.id}`}
                      checked={isAdmin || rolePermissions.includes(permission.id)}
                      onCheckedChange={() => handleTogglePermission(permission.id)}
                      disabled={isAdmin}
                    />
                    <label
                      htmlFor={`${role.id}-${permission.id}`}
                      className={`text-sm flex-1 ${isAdmin ? 'text-muted-foreground' : 'cursor-pointer'}`}
                    >
                      <span className="font-medium">{permission.name}</span>
                      {permission.description && (
                        <span className="text-muted-foreground ml-2">
                          – {permission.description}
                        </span>
                      )}
                    </label>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
