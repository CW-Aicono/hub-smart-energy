import re
import sys

def update_file(path, update_func):
    with open(path, 'r') as f:
        content = f.read()
    new_content = update_func(content)
    with open(path, 'w') as f:
        f.write(new_content)

# 1. ConsumptionTrendTable.tsx
def update_consumption_trend(content):
    if 'useSortableData' in content and 'SortableHead' in content:
        # Already has imports
        pass
    else:
        content = content.replace('import { Table,', 'import { SortableHead, useSortableData } from "@/components/ui/sortable-head";\nimport { Table,')
    
    # Define SortKey
    # Find start of component
    # Insert useSortableData
    
    pattern = r'(const energyTypes = new Set<string>\(\);.*?if \(energyTypes\.size === 0\) return null;)'
    replacement = r'''\1

  type SortKey = "type" | "trend" | number;
  const energyRows = Array.from(energyTypes).map(eType => {
    const latestVal = consumption[latestYear]?.[locationId]?.[eType] || 0;
    const prevVal = prevYear ? (consumption[prevYear]?.[locationId]?.[eType] || 0) : 0;
    const trendPct = prevVal > 0 ? ((latestVal - prevVal) / prevVal) * 100 : 0;
    return { eType, latestVal, prevVal, trendPct };
  });

  const { sorted, sort, toggle } = useSortableData(energyRows, (r, k) => {
    if (k === "type") return ENERGY_LABELS[r.eType] || r.eType;
    if (k === "trend") return r.prevVal > 0 ? r.trendPct : -999;
    if (typeof k === "number") return consumption[k]?.[locationId]?.[r.eType] || 0;
    return null;
  });'''
    content = re.sub(pattern, replacement, content, flags=re.DOTALL)
    
    # Replace TableHeaders
    content = content.replace('<TableHead>Energieträger</TableHead>', '<SortableHead sortKey="type" current={sort} onToggle={toggle}>Energieträger</SortableHead>')
    content = content.replace('{sortedYears.map((y) => (\n            <TableHead key={y} className="text-right">{y}</TableHead>\n          ))}', '{sortedYears.map((y) => (\n            <SortableHead key={y} sortKey={y} current={sort} onToggle={toggle} className="text-right">{y}</SortableHead>\n          ))}')
    content = content.replace('<TableHead className="text-right">Trend</TableHead>', '<SortableHead sortKey="trend" current={sort} onToggle={toggle} className="text-right">Trend</SortableHead>')
    
    # Replace TableBody mapping
    content = re.sub(r'\{Array\.from\(energyTypes\)\.sort\(\)\.map\(\(eType\) => \{.*?return \(', '{sorted.map((row) => {\n          const { eType, latestVal, prevVal, trendPct } = row;\n          return (', content, flags=re.DOTALL)
    
    return content

# 2. LocationRanking.tsx
def update_location_ranking(content):
    if 'useSortableData' not in content:
        content = content.replace('import { Table,', 'import { SortableHead, useSortableData } from "@/components/ui/sortable-head";\nimport { Table,')

    pattern = r'(const ranked = locations.*?\.sort\(\(a, b\) => b\.specific - a\.specific\);)'
    replacement = r'''const baseRanked = locations
    .filter((l) => l.net_floor_area && l.net_floor_area > 0)
    .map((l) => {
      const kwh = consumption[l.id]?.[energyType] || 0;
      const specific = kwh / l.net_floor_area!;
      const rating = l.usage_type ? getRating(specific, energyType) : null;
      return { location: l, kwh, specific, rating };
    });

  type SortKey = "name" | "usage_type" | "area" | "specific" | "rating" | "kwh";
  const { sorted, sort, toggle } = useSortableData(baseRanked, (r, k) => {
    switch (k) {
      case "name": return r.location.name;
      case "usage_type": return r.location.usage_type;
      case "area": return r.location.net_floor_area;
      case "specific": return r.specific;
      case "rating": return r.rating;
      case "kwh": return r.kwh;
      default: return null;
    }
  }, { key: "specific", direction: "desc" });'''
    content = re.sub(pattern, replacement, content, flags=re.DOTALL)
    
    content = content.replace('<TableHead>Liegenschaft</TableHead>', '<SortableHead sortKey="name" current={sort} onToggle={toggle}>Liegenschaft</SortableHead>')
    content = content.replace('<TableHead>Typ</TableHead>', '<SortableHead sortKey="usage_type" current={sort} onToggle={toggle}>Typ</SortableHead>')
    content = content.replace('<TableHead className="text-right">NGF (m²)</TableHead>', '<SortableHead sortKey="area" current={sort} onToggle={toggle} className="text-right">NGF (m²)</SortableHead>')
    content = content.replace('<TableHead className="text-right">kWh/m²a</TableHead>', '<SortableHead sortKey="specific" current={sort} onToggle={toggle} className="text-right">kWh/m²a</SortableHead>')
    content = content.replace('<TableHead className="text-center">Bewertung</TableHead>', '<SortableHead sortKey="rating" current={sort} onToggle={toggle} className="text-center">Bewertung</SortableHead>')
    content = content.replace('<TableHead className="text-right">Verbrauch (kWh)</TableHead>', '<SortableHead sortKey="kwh" current={sort} onToggle={toggle} className="text-right">Verbrauch (kWh)</SortableHead>')
    
    content = content.replace('{ranked.map((r, i) => (', '{sorted.map((r, i) => (')
    # Note: Rang i+1 will now change based on sorting, which is usually desired for ranking tables if it represents index.
    return content

# 3. MeasuresTable.tsx
def update_measures_table(content):
    if 'useSortableData' not in content:
        content = content.replace('import { Table,', 'import { SortableHead, useSortableData } from "@/components/ui/sortable-head";\nimport { Table,')

    pattern = r'(export function MeasuresTable\(.*?\) \{)'
    replacement = r'''\1
  type SortKey = "title" | "category" | "status" | "cost" | "savings_kwh" | "savings_eur";
  const { sorted, sort, toggle } = useSortableData(measures, (r, k) => {
    switch (k) {
      case "title": return r.title;
      case "category": return r.category;
      case "status": return r.status;
      case "cost": return r.investment_cost ?? 0;
      case "savings_kwh": return r.estimated_annual_savings_kwh ?? 0;
      case "savings_eur": return r.estimated_annual_savings_eur ?? 0;
      default: return null;
    }
  });
'''
    content = re.sub(pattern, replacement, content, flags=re.DOTALL)
    
    content = content.replace('<TableHead>Maßnahme</TableHead>', '<SortableHead sortKey="title" current={sort} onToggle={toggle}>Maßnahme</SortableHead>')
    content = content.replace('<TableHead>Kategorie</TableHead>', '<SortableHead sortKey="category" current={sort} onToggle={toggle}>Kategorie</SortableHead>')
    content = content.replace('<TableHead>Status</TableHead>', '<SortableHead sortKey="status" current={sort} onToggle={toggle}>Status</SortableHead>')
    content = content.replace('<TableHead className="text-right">Investition (€)</TableHead>', '<SortableHead sortKey="cost" current={sort} onToggle={toggle} className="text-right">Investition (€)</SortableHead>')
    content = content.replace('<TableHead className="text-right">Einsparung (kWh/a)</TableHead>', '<SortableHead sortKey="savings_kwh" current={sort} onToggle={toggle} className="text-right">Einsparung (kWh/a)</SortableHead>')
    content = content.replace('<TableHead className="text-right">Einsparung (€/a)</TableHead>', '<SortableHead sortKey="savings_eur" current={sort} onToggle={toggle} className="text-right">Einsparung (€/a)</SortableHead>')
    
    content = content.replace('{measures.map((m) => {', '{sorted.map((m) => {')
    return content

# Run updates
update_file('src/components/report/ConsumptionTrendTable.tsx', update_consumption_trend)
update_file('src/components/report/LocationRanking.tsx', update_location_ranking)
update_file('src/components/report/MeasuresTable.tsx', update_measures_table)
