

## Energiechart-Legende: Klickbare Buttons mit Grau-Status

### Aktueller Zustand
Die Legende verwendet die eingebaute Recharts-`<Legend>`-Komponente mit einem `onClick`-Handler und einem `formatter`, der inaktive Eintraege per `opacity: 0.4` abdunkelt. Die Darstellung ist jedoch kein echter Button -- es sind nur Text-Spans mit Cursor-Pointer.

### Geplante Aenderung

Die eingebaute Recharts-Legende wird durch eine **eigene Custom-Legend-Komponente** ersetzt, die unterhalb des Charts kleine Buttons rendert:

- Jeder Energietyp (Strom, Gas, Waerme, Wasser) wird als kleiner `<Button variant="outline" size="sm">` dargestellt
- Vor dem Text wird ein farbiger Kreis (oder Linie) als Symbol angezeigt (passend zur Chart-Farbe)
- **Aktiv**: Button mit farbigem Symbol und normalem Text
- **Inaktiv (hidden)**: Symbol und Text werden grau (`text-muted-foreground`, Symbol verliert Farbe)
- Klick toggled den `hiddenKeys`-State wie bisher

### Technische Umsetzung

**Datei: `src/components/dashboard/EnergyChart.tsx`**

1. Entfernen der `<Legend>`-Komponente aus beiden Charts (LineChart und BarChart)
2. Neue Inline-Komponente `ChartLegend` unterhalb von `<ResponsiveContainer>`:

```tsx
<div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
  {visibleEnergyKeys.map((key) => {
    const hidden = hiddenKeys.has(key);
    const nameMap = { strom: "Strom", gas: "Gas", waerme: "Waerme", wasser: "Wasser" };
    return (
      <button
        key={key}
        onClick={() => handleLegendClick({ dataKey: key })}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
          hidden
            ? "border-muted text-muted-foreground opacity-50"
            : "border-input hover:bg-accent"
        )}
      >
        <span
          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: hidden ? "hsl(var(--muted-foreground))" : ENERGY_CHART_COLORS[key] }}
        />
        {nameMap[key]}
      </button>
    );
  })}
</div>
```

3. Entfernen der `legendFormatter`-Funktion (wird nicht mehr benoetigt)

### Betroffene Datei
- `src/components/dashboard/EnergyChart.tsx` (einzige Aenderung)

### Ergebnis
- Kleine, klar erkennbare Toggle-Buttons unter dem Chart
- Farbiger Punkt + Text bei aktiven Energietypen
- Grauer Punkt + grauer Text + reduzierte Opazitaet bei inaktiven
- Gleiches Verhalten wie bisher (Klick toggled Sichtbarkeit)

