import { useEffect, useMemo, useState } from "react";
import type { BoardTheme } from "@/hooks/useBoard";

interface Props {
  theme: BoardTheme | null;
  mode: "light" | "dark" | "system";
  children: React.ReactNode;
}

/**
 * Wendet die HSL-Farben eines Board-Themes als CSS-Variablen
 * auf einen umschlossenen Container an. Greift nicht in das
 * globale Theme der EMS-Hauptanwendung ein.
 */
export default function BoardThemeScope({ theme, mode, children }: Props) {
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const isDark = mode === "dark" || (mode === "system" && systemDark);

  const style = useMemo(() => {
    if (!theme) return {};
    const c = isDark ? theme.colors_dark : theme.colors_light;
    const s: Record<string, string> = {};
    for (const [k, v] of Object.entries(c)) {
      s[`--board-${k}`] = v;
    }
    return s as React.CSSProperties;
  }, [theme, isDark]);

  return (
    <div
      data-board-theme={theme?.name ?? "default"}
      data-board-mode={isDark ? "dark" : "light"}
      style={style}
      className="min-h-screen bg-[hsl(var(--board-background))] text-[hsl(var(--board-foreground))] transition-colors"
    >
      {children}
    </div>
  );
}
