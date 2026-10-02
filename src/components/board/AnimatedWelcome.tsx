import { useEffect, useState } from "react";
import { X, Sun, Sunrise, Sunset, Moon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Phase = "dawn" | "day" | "dusk" | "night";

function phaseFor(h: number): Phase {
  if (h >= 5 && h < 9) return "dawn";
  if (h >= 9 && h < 18) return "day";
  if (h >= 18 && h < 21) return "dusk";
  return "night";
}

function greetingFor(h: number): string {
  if (h >= 5 && h < 11) return "Guten Morgen";
  if (h >= 18 || h < 5) return "Guten Abend";
  return "Guten Tag";
}

const PHASE_BG: Record<Phase, string> = {
  dawn: "from-orange-300 via-rose-300 to-indigo-400",
  day: "from-sky-300 via-cyan-200 to-blue-400",
  dusk: "from-orange-500 via-pink-500 to-purple-700",
  night: "from-slate-900 via-indigo-950 to-slate-950",
};

const PHASE_ICON: Record<Phase, typeof Sun> = {
  dawn: Sunrise,
  day: Sun,
  dusk: Sunset,
  night: Moon,
};

const PHASE_LABEL: Record<Phase, string> = {
  dawn: "Sonnenaufgang",
  day: "Tag",
  dusk: "Sonnenuntergang",
  night: "Nacht",
};

/**
 * Inline animierte Begrüßung am oberen Rand des Boards.
 * - Ein dezenter Farb-Gradient passend zur Tageszeit
 * - Sanfte Sonne-/Mond-Animation
 * - Bei "night" zusätzliche Sterne
 * - Wird einmal pro Session pro User angezeigt; lässt sich schließen.
 */
export default function AnimatedWelcome() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const key = `seh_board_welcome_${user.id}`;
    if (sessionStorage.getItem(key) === "1") return;

    supabase
      .from("profiles")
      .select("contact_person, company_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const displayName =
          data?.contact_person?.trim() ||
          data?.company_name?.trim() ||
          (user.email ? user.email.split("@")[0] : "") ||
          "";
        setName(displayName);
        setVisible(true);
        sessionStorage.setItem(key, "1");
      });
  }, [user?.id]);

  if (!visible) return null;

  const now = new Date();
  const h = now.getHours();
  const phase = phaseFor(h);
  const Icon = PHASE_ICON[phase];
  const isNight = phase === "night";

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4">
      <div
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${PHASE_BG[phase]} shadow-lg animate-fade-in`}
        style={{ animationDuration: "600ms" }}
      >
        {/* Sterne nur nachts */}
        {isNight && (
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: 24 }).map((_, i) => {
              const top = (i * 37) % 100;
              const left = (i * 53) % 100;
              const delay = (i * 0.18) % 3;
              return (
                <span
                  key={i}
                  className="absolute h-1 w-1 rounded-full bg-white/80"
                  style={{
                    top: `${top}%`,
                    left: `${left}%`,
                    animation: `welcome-twinkle 2.4s ease-in-out ${delay}s infinite`,
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Sonne/Mond schwebt */}
        <div
          className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/30 blur-2xl"
          style={{ animation: "welcome-float 6s ease-in-out infinite" }}
        />
        <div
          className="absolute right-6 top-6 text-white/90"
          style={{ animation: "welcome-float 6s ease-in-out infinite" }}
        >
          <Icon className="h-12 w-12 drop-shadow" />
        </div>

        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Begrüßung schließen"
          className="absolute right-3 top-3 z-10 rounded-md bg-black/20 p-1.5 text-white hover:bg-black/40"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative px-6 py-8 sm:px-10 sm:py-12 text-white">
          <div className="text-xs uppercase tracking-widest text-white/80">
            {PHASE_LABEL[phase]} · {now.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}
          </div>
          <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight drop-shadow">
            {greetingFor(h)}
            {name ? `, ${name}` : ""}!
          </h2>
          <p className="mt-2 text-sm sm:text-base text-white/85 max-w-xl">
            Schön, dass Sie wieder da sind. Hier ist Ihr aktuelles Board mit allen wichtigen Kennzahlen.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes welcome-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes welcome-twinkle {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
