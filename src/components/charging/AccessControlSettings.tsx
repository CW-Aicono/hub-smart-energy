import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, Info, Check, Users } from "lucide-react";
import { useChargingUserGroups } from "@/hooks/useChargingUsers";
import { useAllowedUserGroups } from "@/hooks/useChargePointAccessControl";

export interface AccessSettings {
  free_charging: boolean;
  user_group_restriction: boolean;
  max_charging_duration_min: number;
}

interface Props {
  entityType: "group" | "chargepoint";
  entityId: string;
  settings: AccessSettings;
  isAdmin: boolean;
  readOnly?: boolean;
  onSave: (settings: AccessSettings) => void;
}

export function AccessControlSettings({ entityType, entityId, settings, isAdmin, readOnly, onSave }: Props) {
  const [access, setAccess] = useState<AccessSettings>({ ...settings });
  const [saved, setSaved] = useState(false);
  const { groups: allUserGroups } = useChargingUserGroups();
  const { allowedGroupIds, setAllowedGroups } = useAllowedUserGroups(entityType, entityId);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  useEffect(() => {
    setSelectedGroups(allowedGroupIds);
  }, [allowedGroupIds]);

  useEffect(() => {
    setAccess({ ...settings });
  }, [settings]);

  const disabled = !isAdmin || readOnly;

  const handleSave = () => {
    onSave(access);
    if (access.user_group_restriction) {
      setAllowedGroups.mutate(selectedGroups);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div>
          <p className="font-medium">Freies Laden erlauben</p>
          <p className="text-sm text-muted-foreground">Laden ohne RFID-Karte oder App-Autorisierung</p>
        </div>
        <Switch checked={access.free_charging} onCheckedChange={(v) => setAccess({ ...access, free_charging: v })} disabled={disabled} />
      </div>

      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div>
          <p className="font-medium">Nutzergruppen-Beschränkung</p>
          <p className="text-sm text-muted-foreground">Nur bestimmte Nutzergruppen dürfen laden</p>
        </div>
        <Switch checked={access.user_group_restriction} onCheckedChange={(v) => setAccess({ ...access, user_group_restriction: v })} disabled={disabled} />
      </div>

      {access.user_group_restriction && (
        <div className="ml-4 p-4 border rounded-lg bg-muted/30 space-y-3">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Users className="h-3 w-3" /> Erlaubte Nutzergruppen
          </Label>
          {allUserGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Nutzergruppen vorhanden. Erstellen Sie zuerst Gruppen unter „Ladenutzer".</p>
          ) : (
            <div className="space-y-2">
              {allUserGroups.map((ug) => (
                <label key={ug.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer">
                  <Checkbox
                    checked={selectedGroups.includes(ug.id)}
                    onCheckedChange={() => toggleGroup(ug.id)}
                    disabled={disabled}
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium">{ug.name}</span>
                    {ug.description && <p className="text-xs text-muted-foreground">{ug.description}</p>}
                  </div>
                  {ug.is_app_user && <Badge variant="outline" className="text-xs">App-Nutzer</Badge>}
                </label>
              ))}
            </div>
          )}
          {selectedGroups.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {selectedGroups.length} Gruppe{selectedGroups.length !== 1 ? "n" : ""} ausgewählt
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div>
          <p className="font-medium">Maximale Ladedauer</p>
          <p className="text-sm text-muted-foreground">Ladevorgang nach Zeitlimit automatisch beenden</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="w-20"
            value={access.max_charging_duration_min}
            onChange={(e) => setAccess({ ...access, max_charging_duration_min: parseInt(e.target.value) || 480 })}
            disabled={disabled}
          />
          <span className="text-sm text-muted-foreground">min</span>
        </div>
      </div>

      {!disabled && (
        <Button onClick={handleSave} variant={saved ? "outline" : "default"} className="gap-1.5">
          {saved ? <><Check className="h-3.5 w-3.5" />Gespeichert</> : "Einstellungen speichern"}
        </Button>
      )}

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Info className="h-3 w-3" />
        {entityType === "group"
          ? "Diese Einstellungen gelten für alle Ladepunkte der Gruppe."
          : "Diese Einstellungen gelten nur für diesen Ladepunkt."}
      </p>
    </div>
  );
}
