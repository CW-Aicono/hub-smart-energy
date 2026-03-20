

## Fix: "column meters.max_power_kw does not exist"

### Ursache

Die Edge Function `copilot-analysis` fragt in zwei Stellen `max_power_kw` aus der Tabelle `meters` ab — dieses Feld existiert dort aber nicht (es gehört zur Tabelle `charge_points`).

**Zeile 109** (Investitionsanalyse):
```
.select("id, name, energy_type, is_main_meter, max_power_kw")
```

**Zeile 273** (Einsparpotentiale):
```
.select("id, name, energy_type, is_main_meter, max_power_kw")
```

### Lösung

In `supabase/functions/copilot-analysis/index.ts`:

1. **Zeile 109**: `max_power_kw` aus dem Select entfernen → `"id, name, energy_type, is_main_meter"`
2. **Zeile 273**: Ebenso `max_power_kw` entfernen → `"id, name, energy_type, is_main_meter"`
3. **Zeile 131**: Den Verweis `mainMeter?.max_power_kw` durch `null` ersetzen (oder alternativ den Wert aus `grid_connection_kva` des Input-Parameters verwenden, was bereits als Fallback existiert)

### Betroffene Datei
- `supabase/functions/copilot-analysis/index.ts` — 3 Zeilen anpassen

