import re
import sys

def update_file(path, update_func):
    with open(path, 'r') as f:
        content = f.read()
    new_content = update_func(content)
    with open(path, 'w') as f:
        f.write(new_content)

# 4. PropertyProfile.tsx
def update_property_profile(content):
    if 'useSortableData' not in content:
        content = content.replace('import { Table,', 'import { SortableHead, useSortableData } from "@/components/ui/sortable-head";\nimport { Table,')

    # Find the consumption mapping inside the component
    # It's inside a complex component, let's be careful.
    
    pattern = r'(\{hasConsumption && \(\n\s+<div className="rounded-lg border p-4 space-y-3">.*?<TableBody>)(.*?)(</TableBody>)'
    
    def inner_replace(match):
        pre = match.group(1)
        body = match.group(2)
        post = match.group(3)
        
        # Insert useSortableData before return
        # This is harder with regex on the whole file. 
        # Let's find the TableHeader first.
        return match.group(0)

    # Simplified approach: just replace the specific parts
    content = content.replace('<TableHead>Energieträger</TableHead>', '<SortableHead sortKey="type" current={sort} onToggle={toggle}>Energieträger</SortableHead>')
    content = content.replace('<TableHead className="text-right">Verbrauch</TableHead>', '<SortableHead sortKey="kwh" current={sort} onToggle={toggle} className="text-right">Verbrauch</SortableHead>')
    content = content.replace('{loc.net_floor_area && <TableHead className="text-right">kWh/m²a</TableHead>}', '{loc.net_floor_area && <SortableHead sortKey="specific" current={sort} onToggle={toggle} className="text-right">kWh/m²a</SortableHead>}')
    content = content.replace('<TableHead className="text-right">CO₂</TableHead>', '<SortableHead sortKey="co2" current={sort} onToggle={toggle} className="text-right">CO₂</SortableHead>')
    content = content.replace('{prices && prices.length > 0 && <TableHead className="text-right">Kosten</TableHead>}', '{prices && prices.length > 0 && <SortableHead sortKey="cost" current={sort} onToggle={toggle} className="text-right">Kosten</SortableHead>}')
    
    # Insert useSortableData
    sort_data = '''  const consumptionList = useMemo(() => {
    if (!consumption) return [];
    return Object.entries(consumption).map(([eType, kwh]) => {
      const co2 = calculateCo2(kwh, eType, factors);
      const specific = loc.net_floor_area ? kwh / loc.net_floor_area : null;
      const price = prices ? getActivePrice(prices, loc.id, eType, reportYear) : 0;
      const cost = price > 0 ? calculateEnergyCost(kwh, price) : null;
      return { eType, kwh, co2, specific, cost };
    });
  }, [consumption, factors, loc.id, loc.net_floor_area, prices, reportYear]);

  type ConsumptionSortKey = "type" | "kwh" | "specific" | "co2" | "cost";
  const { sorted, sort, toggle } = useSortableData(consumptionList, (r, k) => {
    switch (k) {
      case "type": return ENERGY_LABELS[r.eType] || r.eType;
      case "kwh": return r.kwh;
      case "specific": return r.specific ?? 0;
      case "co2": return r.co2 ?? 0;
      case "cost": return r.cost ?? 0;
      default: return null;
    }
  });
'''
    content = content.replace('  const hasConsumption = consumption && Object.keys(consumption).length > 0;', '  const hasConsumption = consumption && Object.keys(consumption).length > 0;\n' + sort_data)
    
    # Update mapping
    pattern_map = r'\{Object\.entries\(consumption!\)\.map\(\(\[eType, kwh\]\) => \{.*?return \('
    replacement_map = r'{sorted.map((row) => {\n                  const { eType, kwh, co2, specific, cost } = row;\n                  return ('
    content = re.sub(pattern_map, replacement_map, content, flags=re.DOTALL)

    return content

# 5. WeatherNormalizationWidget.tsx
def update_weather_norm(content):
    if 'useSortableData' not in content:
        content = content.replace('import { Table,', 'import { SortableHead, useSortableData } from "@/components/ui/sortable-head";\nimport { Table,')

    # Insert useSortableData before return
    sort_logic = '''  type SortKey = "month" | "degreeDays" | "temp" | "actual" | "norm" | "dev";
  const { sorted: sortedTableData, sort: tableSort, toggle: tableToggle } = useSortableData(filteredData, (r, k) => {
    switch (k) {
      case "month": return r.month;
      case "degreeDays": return r.degreeDays;
      case "temp": return r.avgTemperature;
      case "actual": return r.actualConsumption;
      case "norm": return r.normalizedConsumption;
      case "dev": return r.deviationPercent;
      default: return null;
    }
  });
'''
    content = content.replace('  return (', sort_logic + '\n  return (')

    content = content.replace('<TableHead>{T("wn.monthCol")}</TableHead>', '<SortableHead sortKey="month" current={tableSort} onToggle={tableToggle}>{T("wn.monthCol")}</SortableHead>')
    content = content.replace('<TableHead className="text-right">{T("wn.degreeDays")}</TableHead>', '<SortableHead sortKey="degreeDays" current={tableSort} onToggle={tableToggle} className="text-right">{T("wn.degreeDays")}</SortableHead>')
    content = content.replace('<TableHead className="text-right">{T("wn.avgTemp")}</TableHead>', '<SortableHead sortKey="temp" current={tableSort} onToggle={tableToggle} className="text-right">{T("wn.avgTemp")}</SortableHead>')
    content = content.replace('<TableHead className="text-right">{T("wn.actualShort")}</TableHead>', '<SortableHead sortKey="actual" current={tableSort} onToggle={tableToggle} className="text-right">{T("wn.actualShort")}</SortableHead>')
    content = content.replace('<TableHead className="text-right">{T("wn.normalized")}</TableHead>', '<SortableHead sortKey="norm" current={tableSort} onToggle={tableToggle} className="text-right">{T("wn.normalized")}</SortableHead>')
    content = content.replace('<TableHead className="text-right">{T("wn.devShort")}</TableHead>', '<SortableHead sortKey="dev" current={tableSort} onToggle={tableToggle} className="text-right">{T("wn.devShort")}</SortableHead>')

    content = content.replace('{filteredData.map((row) => (', '{sortedTableData.map((row) => (')

    return content

update_file('src/components/report/PropertyProfile.tsx', update_property_profile)
update_file('src/components/dashboard/WeatherNormalizationWidget.tsx', update_weather_norm)
