import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Shield, ChevronDown, ChevronRight, Trash2, Lock } from "lucide-react";
import { CustomRole, Permission } from "@/hooks/useCustomRoles";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";

interface RoleCardProps {
  role: CustomRole;
  permissions: Permission[];
  permissionsByCategory: Record<string, Permission[]>;
  rolePermissions: string[];
  onTogglePermission: (roleId: string, permissionId: string) => Promise<{ error: Error | null }>;
  onDeleteRole: (id: string) => Promise<{ error: Error | null }>;
  isAdmin?: boolean;
}

const CATEGORY_LABELS: Record<string, Record<string, string>> = {
  locations: { de: "Standorte", en: "Locations", es: "Ubicaciones", nl: "Locaties" },
  floors: { de: "Etagen & Grundrisse", en: "Floors & Floor Plans", es: "Plantas y planos", nl: "Verdiepingen & Plattegronden" },
  energy: { de: "Energiedaten", en: "Energy Data", es: "Datos de energía", nl: "Energiegegevens" },
  meters: { de: "Messstellen", en: "Meters", es: "Contadores", nl: "Meters" },
  alerts: { de: "Alarmregeln", en: "Alert Rules", es: "Reglas de alarma", nl: "Alarmregels" },
  scanners: { de: "Scanner", en: "Scanners", es: "Escáneres", nl: "Scanners" },
  integrations: { de: "Integrationen", en: "Integrations", es: "Integraciones", nl: "Integraties" },
  reports: { de: "Berichte", en: "Reports", es: "Informes", nl: "Rapporten" },
  users: { de: "Benutzerverwaltung", en: "User Management", es: "Gestión de usuarios", nl: "Gebruikersbeheer" },
  roles: { de: "Rollenverwaltung", en: "Role Management", es: "Gestión de roles", nl: "Rollenbeheer" },
  settings: { de: "Einstellungen", en: "Settings", es: "Configuración", nl: "Instellingen" },
  dashboard: { de: "Dashboard", en: "Dashboard", es: "Panel de control", nl: "Dashboard" },
  automation: { de: "Automation", en: "Automation", es: "Automatización", nl: "Automatisering" },
  charging: { de: "Ladeinfrastruktur", en: "Charging Infrastructure", es: "Infraestructura de carga", nl: "Laadinfrastructuur" },
  network: { de: "Netzwerkinfrastruktur", en: "Network Infrastructure", es: "Infraestructura de red", nl: "Netwerkinfrastructuur" },
  email_templates: { de: "E-Mail-Vorlagen", en: "Email Templates", es: "Plantillas de correo", nl: "E-mailsjablonen" },
  energy_prices: { de: "Energiepreise", en: "Energy Prices", es: "Precios de energía", nl: "Energieprijzen" },
  live_values: { de: "Live-Sensorwerte", en: "Live Sensor Values", es: "Valores de sensores en vivo", nl: "Live sensorwaarden" },
};

export function RoleCard({
  role, permissions, permissionsByCategory, rolePermissions,
  onTogglePermission, onDeleteRole, isAdmin = false,
}: RoleCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const { t, language } = useTranslation();
  const T = (key: string) => t(key as any);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.has(category) ? next.delete(category) : next.add(category);
      return next;
    });
  };

  const handleTogglePermission = async (permissionId: string) => {
    if (isAdmin) return;
    const { error } = await onTogglePermission(role.id, permissionId);
    if (error) toast.error(T("roleCard.permError"));
  };

  const handleDelete = async () => {
    const { error } = await onDeleteRole(role.id);
    if (error) {
      toast.error(T("roleCard.deleteError") + ": " + error.message);
    } else {
      toast.success(T("roleCard.deleteSuccess"));
    }
  };

  const assignedCount = rolePermissions.length;
  const totalCount = permissions.length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {role.name}
                  {isAdmin && <Lock className="h-4 w-4 text-muted-foreground" />}
                </CardTitle>
              </button>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {isAdmin ? T("roleCard.allRights") : `${assignedCount}/${totalCount}`} {T("roleCard.rights")}
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
                      <AlertDialogTitle>{T("roleCard.deleteTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {T("roleCard.deleteDesc").replace("{name}", role.name)}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        {t("common.delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
          {role.description && <CardDescription>{role.description}</CardDescription>}
          {isAdmin && (
            <CardDescription className="text-amber-600">{T("roleCard.adminNote")}</CardDescription>
          )}
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(permissionsByCategory).map(([category, categoryPermissions]) => (
                <Collapsible key={category} open={expandedCategories.has(category)} onOpenChange={() => toggleCategory(category)}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                      <span className="font-medium">
                        {CATEGORY_LABELS[category]?.[language] || CATEGORY_LABELS[category]?.de || category}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {isAdmin ? categoryPermissions.length : categoryPermissions.filter((p) => rolePermissions.includes(p.id)).length}/{categoryPermissions.length}
                        </Badge>
                        {expandedCategories.has(category) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-4 pt-2 space-y-2">
                    {categoryPermissions.map((permission) => (
                      <div key={permission.id} className="flex items-center gap-3 py-1">
                        <Checkbox
                          id={`${role.id}-${permission.id}`}
                          checked={isAdmin || rolePermissions.includes(permission.id)}
                          onCheckedChange={() => handleTogglePermission(permission.id)}
                          disabled={isAdmin}
                        />
                        <label htmlFor={`${role.id}-${permission.id}`} className={`text-sm flex-1 ${isAdmin ? 'text-muted-foreground' : 'cursor-pointer'}`}>
                          <span className="font-medium">{permission.name}</span>
                          {permission.description && <span className="text-muted-foreground ml-2">– {permission.description}</span>}
                        </label>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
