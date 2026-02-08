import { useState } from "react";
import { useUserPreferences, ColorScheme, ThemeMode, Language } from "@/hooks/useUserPreferences";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Globe, Palette, Monitor, Sun, Moon, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const colorSchemes: { value: ColorScheme; label: string; colors: string[] }[] = [
  { value: "default", label: "Standard", colors: ["hsl(220, 60%, 20%)", "hsl(152, 55%, 42%)"] },
  { value: "ocean", label: "Ozean", colors: ["hsl(200, 70%, 30%)", "hsl(180, 60%, 45%)"] },
  { value: "forest", label: "Wald", colors: ["hsl(140, 40%, 25%)", "hsl(80, 50%, 45%)"] },
  { value: "sunset", label: "Sonnenuntergang", colors: ["hsl(20, 70%, 30%)", "hsl(35, 90%, 55%)"] },
  { value: "lavender", label: "Lavendel", colors: ["hsl(270, 40%, 35%)", "hsl(280, 50%, 60%)"] },
  { value: "slate", label: "Schiefer", colors: ["hsl(220, 15%, 25%)", "hsl(220, 20%, 50%)"] },
  { value: "rose", label: "Rose", colors: ["hsl(350, 50%, 35%)", "hsl(340, 60%, 55%)"] },
  { value: "amber", label: "Bernstein", colors: ["hsl(30, 60%, 25%)", "hsl(38, 92%, 50%)"] },
];

const themeModes: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Hell", icon: Sun },
  { value: "dark", label: "Dunkel", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const languages: { value: Language; label: string }[] = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
];

export function ProfileSettings() {
  const { preferences, loading, updatePreferences } = useUserPreferences();
  const { toast } = useToast();
  const [updating, setUpdating] = useState<string | null>(null);

  const handleUpdate = async (
    field: "language" | "color_scheme" | "theme_mode",
    value: string
  ) => {
    setUpdating(field);
    const { error } = await updatePreferences({ [field]: value });
    setUpdating(null);

    if (error) {
      toast({
        title: "Fehler",
        description: "Einstellung konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Gespeichert",
        description: "Ihre Einstellung wurde aktualisiert.",
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="h-20 bg-muted/50 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Language Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-5 w-5" />
            Sprache
          </CardTitle>
          <CardDescription>
            Wählen Sie Ihre bevorzugte Sprache für die Benutzeroberfläche
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={preferences?.language ?? "de"}
            onValueChange={(value) => handleUpdate("language", value)}
            disabled={updating === "language"}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Sprache wählen" />
            </SelectTrigger>
            <SelectContent>
              {languages.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Color Scheme Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="h-5 w-5" />
            Farbschema
          </CardTitle>
          <CardDescription>
            Wählen Sie ein Farbschema für die Anwendung
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {colorSchemes.map((scheme) => (
              <button
                key={scheme.value}
                onClick={() => handleUpdate("color_scheme", scheme.value)}
                disabled={updating === "color_scheme"}
                className={cn(
                  "relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all hover:border-primary/50",
                  preferences?.color_scheme === scheme.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <div className="flex gap-1">
                  {scheme.colors.map((color, idx) => (
                    <div
                      key={idx}
                      className="w-6 h-6 rounded-full shadow-sm"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <span className="text-sm font-medium">{scheme.label}</span>
                {preferences?.color_scheme === scheme.value && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Theme Mode Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Monitor className="h-5 w-5" />
            Darstellungsmodus
          </CardTitle>
          <CardDescription>
            Wählen Sie zwischen hellem, dunklem oder System-Modus
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={preferences?.theme_mode ?? "system"}
            onValueChange={(value) => handleUpdate("theme_mode", value)}
            className="flex flex-wrap gap-4"
            disabled={updating === "theme_mode"}
          >
            {themeModes.map((mode) => (
              <div key={mode.value} className="flex items-center space-x-2">
                <RadioGroupItem value={mode.value} id={mode.value} />
                <Label
                  htmlFor={mode.value}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <mode.icon className="h-4 w-4" />
                  {mode.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>
    </div>
  );
}
