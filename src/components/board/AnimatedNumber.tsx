import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  className?: string;
}

/**
 * Zähl-Animation für KPI-Werte. Extrahiert die erste Zahl aus dem
 * formatierten String (z. B. "12.345 €" → 12345) und zählt in ~600 ms hoch.
 * Nicht-numerische Werte (z. B. "—") werden unverändert ausgegeben.
 */
export default function AnimatedNumber({ value, className }: Props) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number | null>(null);
  const prevValueRef = useRef<string>(value);

  useEffect(() => {
    // Parse: Deutsche Formatierung (1.234,56 €) → reine Zahl
    const match = value.match(/-?[\d.,]+/);
    if (!match) {
      setDisplay(value);
      return;
    }
    const numericStr = match[0].replace(/\./g, "").replace(",", ".");
    const target = parseFloat(numericStr);
    if (!isFinite(target)) {
      setDisplay(value);
      return;
    }

    // Vorher: gleichen Wert? Skip
    if (prevValueRef.current === value) return;
    prevValueRef.current = value;

    const prevMatch = display.match(/-?[\d.,]+/);
    const start = prevMatch
      ? parseFloat(prevMatch[0].replace(/\./g, "").replace(",", "."))
      : 0;
    if (!isFinite(start)) {
      setDisplay(value);
      return;
    }

    const duration = 700;
    const t0 = performance.now();
    const prefix = value.slice(0, match.index);
    const suffix = value.slice((match.index ?? 0) + match[0].length);
    const decimals = (match[0].split(",")[1] ?? "").length;
    const fmt = new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const current = start + (target - start) * eased;
      setDisplay(`${prefix}${fmt.format(current)}${suffix}`);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span className={className}>{display}</span>;
}
