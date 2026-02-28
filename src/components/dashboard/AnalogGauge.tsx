import { useMemo } from "react";

export interface GaugeData {
  energyType: string;
  label: string;
  currentValue: number;
  peakValue: number;
  maxScale: number;
  unit: string;
  color: string;
  hidePeak?: boolean;
}

/** Interpolate eco gradient color at a given fraction (0–1) */
function ecoColorAtFraction(frac: number): string {
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const hexToRgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgbToHex = (r: number, g: number, b: number) =>
    `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

  const red = hexToRgb("#ef4444");
  const yellow = hexToRgb("#eab308");
  const green = hexToRgb("#22c55e");

  let rgb: number[];
  if (frac <= 0.5) {
    const t = frac / 0.5;
    rgb = [lerp(red[0], yellow[0], t), lerp(red[1], yellow[1], t), lerp(red[2], yellow[2], t)];
  } else {
    const t = (frac - 0.5) / 0.5;
    rgb = [lerp(yellow[0], green[0], t), lerp(yellow[1], green[1], t), lerp(yellow[2], green[2], t)];
  }
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

export default function AnalogGauge({ data }: { data: GaugeData }) {
  const { currentValue, peakValue, maxScale, unit, label, color, hidePeak, energyType } = data;

  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 90; // outer rim
  const innerR = 85; // inner dark circle
  const arcR = 72; // tick arc radius

  const startAngle = -225;
  const endAngle = 45;
  const sweep = endAngle - startAngle; // 270°

  const valueFrac = Math.min(currentValue, maxScale) / maxScale;
  const valueAngle = startAngle + valueFrac * sweep;
  const peakAngle = startAngle + (Math.min(peakValue, maxScale) / maxScale) * sweep;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const pt = (angle: number, radius: number) => ({
    x: cx + radius * Math.cos(toRad(angle)),
    y: cy + radius * Math.sin(toRad(angle)),
  });

  const numTicks = 10;
  const ticks = useMemo(() =>
    Array.from({ length: numTicks + 1 }, (_, i) => {
      const frac = i / numTicks;
      const angle = startAngle + frac * sweep;
      const isMajor = i % 2 === 0;
      return { frac, angle, isMajor, tickVal: Math.round(frac * maxScale * 100) / 100 };
    }), [maxScale]);

  // Minor ticks between majors
  const minorTicks = useMemo(() => {
    const result: number[] = [];
    for (let i = 0; i < numTicks; i++) {
      for (let j = 1; j < 5; j++) {
        const frac = (i + j / 5) / numTicks;
        result.push(startAngle + frac * sweep);
      }
    }
    return result;
  }, []);

  const needleLen = arcR - 8;
  const needleTip = pt(valueAngle, needleLen);
  const needleTail = pt(valueAngle + 180, 10);
  const needleL = pt(valueAngle + 90, 2);
  const needleR = pt(valueAngle - 90, 2);

  const peakPt1 = pt(peakAngle, arcR - 4);
  const peakPt2 = pt(peakAngle, arcR + 3);

  const arcStart = pt(startAngle, arcR);
  const arcEnd = pt(endAngle, arcR);
  const valEnd = pt(valueAngle, arcR);

  const displayValue = currentValue >= 1000
    ? (currentValue / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })
    : currentValue.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  const displayUnit = currentValue >= 1000 ? (unit === "kW" ? "MW" : unit) : unit;

  const fmtTick = (v: number) => {
    if (v >= 1000) return `${Math.round(v / 1000)}k`;
    if (v === Math.floor(v)) return String(v);
    return v.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  };

  const isEco = energyType === "eco";
  const needleColor = isEco ? ecoColorAtFraction(valueFrac) : color;

  const pad = 8;
  const vbX = -pad;
  const vbY = -pad;
  const vbW = size + pad * 2;
  const vbH = size + pad * 2;

  return (
    <div className="flex flex-col items-center flex-1 min-w-[140px] max-w-[240px]">
      <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} className="w-full">
        <defs>
          {/* Rim gradient */}
          <linearGradient id={`rim-${energyType}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.4" />
            <stop offset="50%" stopColor="hsl(var(--border))" stopOpacity="0.6" />
            <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.3" />
          </linearGradient>
          {/* Glow for value arc */}
          <filter id={`glow-${energyType}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={color} floodOpacity="0.5" />
          </filter>
          {/* Needle gradient */}
          <linearGradient id={`needle-g-${energyType}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={needleColor} />
            <stop offset="100%" stopColor={needleColor} stopOpacity="0.7" />
          </linearGradient>
          {isEco && (
            <>
              <linearGradient id="eco-arc-bg" x1="0%" y1="100%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="50%" stopColor="#eab308" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
              <linearGradient id="eco-arc-val" x1="0%" y1="100%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ef4444" />
                {valueFrac > 0.1 && <stop offset="50%" stopColor="#eab308" />}
                <stop offset="100%" stopColor={ecoColorAtFraction(valueFrac)} />
              </linearGradient>
            </>
          )}
        </defs>

        {/* Outer rim circle */}
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={`url(#rim-${energyType})`} strokeWidth={2.5} />

        {/* Inner dark filled circle */}
        <circle cx={cx} cy={cy} r={innerR} fill="hsl(var(--card))" stroke="none" opacity={0.95} />
        {/* Subtle inner shadow */}
        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="hsl(var(--border))" strokeWidth={0.5} opacity={0.3} />

        {/* Background arc (track) */}
        <path
          d={`M ${arcStart.x} ${arcStart.y} A ${arcR} ${arcR} 0 1 1 ${arcEnd.x} ${arcEnd.y}`}
          fill="none"
          stroke={isEco ? "url(#eco-arc-bg)" : "hsl(var(--border))"}
          strokeWidth={5}
          strokeLinecap="round"
          opacity={isEco ? 0.15 : 0.25}
        />

        {/* Value arc */}
        {currentValue > 0 && (
          <path
            d={`M ${arcStart.x} ${arcStart.y} A ${arcR} ${arcR} 0 ${valueAngle - startAngle > 180 ? 1 : 0} 1 ${valEnd.x} ${valEnd.y}`}
            fill="none"
            stroke={isEco ? "url(#eco-arc-val)" : color}
            strokeWidth={5}
            strokeLinecap="round"
            filter={`url(#glow-${energyType})`}
            opacity={0.8}
            style={{ transition: "all 1s cubic-bezier(0.4,0,0.2,1)" }}
          />
        )}

        {/* Minor ticks */}
        {minorTicks.map((angle, i) => {
          const inner = pt(angle, arcR - 3);
          const outer = pt(angle, arcR);
          return (
            <line key={`m${i}`} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
              stroke="hsl(var(--foreground))" strokeWidth={0.5} opacity={0.15} />
          );
        })}

        {/* Major & half ticks + labels */}
        {ticks.map((t, i) => {
          const tickLen = t.isMajor ? 12 : 6;
          const inner = pt(t.angle, arcR - tickLen);
          const outer = pt(t.angle, arcR);
          const labelPt = pt(t.angle, arcR - 20);
          return (
            <g key={i}>
              <line
                x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
                stroke="hsl(var(--foreground))"
                strokeWidth={t.isMajor ? 1.5 : 0.7}
                opacity={t.isMajor ? 0.7 : 0.3}
              />
              {t.isMajor && (
                <text
                  x={labelPt.x} y={labelPt.y}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="hsl(var(--foreground))" fontSize={9} fontWeight={600}
                  opacity={0.8}
                >
                  {fmtTick(t.tickVal)}
                </text>
              )}
            </g>
          );
        })}

        {/* Peak marker */}
        {!hidePeak && peakValue > 0 && (
          <line
            x1={peakPt1.x} y1={peakPt1.y} x2={peakPt2.x} y2={peakPt2.y}
            stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round" opacity={0.85}
          >
            <title>Peak: {peakValue.toLocaleString("de-DE", { maximumFractionDigits: 1 })} {unit}</title>
          </line>
        )}

        {/* Needle */}
        <polygon
          points={`${needleTip.x},${needleTip.y} ${needleL.x},${needleL.y} ${needleTail.x},${needleTail.y} ${needleR.x},${needleR.y}`}
          fill={`url(#needle-g-${energyType})`}
          opacity={0.9}
          style={{ transition: "all 1s cubic-bezier(0.4,0,0.2,1)" }}
        />

        {/* Center hub */}
        <circle cx={cx} cy={cy} r={8} fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={4.5} fill="hsl(var(--foreground))" opacity={0.5} />
        <circle cx={cx} cy={cy} r={2} fill="hsl(var(--background))" />

        {/* Digital readout */}
        <text x={cx} y={cy + 28} textAnchor="middle" fill="hsl(var(--foreground))" fontSize={18} fontWeight={700}
          fontFamily="'SF Mono', 'Cascadia Code', monospace">
          {displayValue}
        </text>
        <text x={cx} y={cy + 40} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={9} fontWeight={500}>
          {displayUnit}
        </text>
      </svg>
      <span className="text-sm font-semibold tracking-wide -mt-3" style={{ color }}>{label}</span>
      {!hidePeak && peakValue > 0 && (
        <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
          <span className="text-destructive">▲</span>
          {peakValue.toLocaleString("de-DE", { maximumFractionDigits: 1 })} {unit}
        </span>
      )}
    </div>
  );
}
