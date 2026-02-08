import { useState } from "react";
import { useUserPreferences, ColorScheme, ThemeMode, Language } from "@/hooks/useUserPreferences";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Globe, Palette, Monitor, Sun, Moon, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProfileSettings() {
  const { t } = useTranslation();
  const { preferences, loading, updatePreferences } = useUserPreferences();
  const { toast } = useToast();
  const [updating, setUpdating] = useState<string | null>(null);

  const colorSchemes: { value: ColorScheme; labelKey: "colorScheme.default" | "colorScheme.ocean" | "colorScheme.forest" | "colorScheme.sunset" | "colorScheme.lavender" | "colorScheme.slate" | "colorScheme.rose" | "colorScheme.amber"; colors: string[] }[] = [
    { value: "default", labelKey: "colorScheme.default", colors: ["hsl(220, 60%, 20%)", "hsl(152, 55%, 42%)"] },
    { value: "ocean", labelKey: "colorScheme.ocean", colors: ["hsl(200, 70%, 30%)", "hsl(180, 60%, 45%)"] },
    { value: "forest", labelKey: "colorScheme.forest", colors: ["hsl(140, 40%, 25%)", "hsl(80, 50%, 45%)"] },
    { value: "sunset", labelKey: "colorScheme.sunset", colors: ["hsl(20, 70%, 30%)", "hsl(35, 90%, 55%)"] },
    { value: "lavender", labelKey: "colorScheme.lavender", colors: ["hsl(270, 40%, 35%)", "hsl(280, 50%, 60%)"] },
    { value: "slate", labelKey: "colorScheme.slate", colors: ["hsl(220, 15%, 25%)", "hsl(220, 20%, 50%)"] },
    { value: "rose", labelKey: "colorScheme.rose", colors: ["hsl(350, 50%, 35%)", "hsl(340, 60%, 55%)"] },
    { value: "amber", labelKey: "colorScheme.amber", colors: ["hsl(30, 60%, 25%)", "hsl(38, 92%, 50%)"] },
  ];

  const themeModes: { value: ThemeMode; labelKey: "profile.light" | "profile.dark" | "profile.system"; icon: typeof Sun }[] = [
    { value: "light", labelKey: "profile.light", icon: Sun },
    { value: "dark", labelKey: "profile.dark", icon: Moon },
    { value: "system", labelKey: "profile.system", icon: Monitor },
  ];

  const languages: { value: Language; labelKey: "language.de" | "language.en" | "language.es" | "language.nl" }[] = [
    { value: "de", labelKey: "language.de" },
    { value: "en", labelKey: "language.en" },
    { value: "es", labelKey: "language.es" },
    { value: "nl", labelKey: "language.nl" },
  ];

  const handleUpdate = async (
    field: "language" | "color_scheme" | "theme_mode",
    value: string
  ) => {
    setUpdating(field);
    const { error } = await updatePreferences({ [field]: value });
    setUpdating(null);

    if (error) {
      toast({
        title: t("common.error"),
        description: t("profile.settingError"),
        variant: "destructive",
      });
    } else {
      toast({
        title: t("common.saved"),
        description: t("profile.settingSaved"),
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
            {t("profile.language")}
          </CardTitle>
          <CardDescription>
            {t("profile.languageDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={preferences?.language ?? "de"}
            onValueChange={(value) => handleUpdate("language", value)}
            disabled={updating === "language"}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("profile.language")} />
            </SelectTrigger>
            <SelectContent>
              {languages.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {t(lang.labelKey)}
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
            {t("profile.colorScheme")}
          </CardTitle>
          <CardDescription>
            {t("profile.colorSchemeDescription")}
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
                <span className="text-sm font-medium">{t(scheme.labelKey)}</span>
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
            {t("profile.themeMode")}
          </CardTitle>
          <CardDescription>
            {t("profile.themeModeDescription")}
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
                  {t(mode.labelKey)}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>
    </div>
  );
}
