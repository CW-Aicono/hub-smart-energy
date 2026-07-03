import re
import sys

def update_file(path, update_func):
    with open(path, 'r') as f:
        content = f.read()
    new_content = update_func(content)
    with open(path, 'w') as f:
        f.write(new_content)

def update_copilot(content):
    # Only if ROI scenario table exists
    if '<Table>' not in content or 'result.roi_scenarios' not in content:
        return content

    sort_logic = '''  type RoiSortKey = "name" | "investment" | "funding" | "savings" | "roi";
  const { sorted: sortedRoi, sort: roiSort, toggle: roiToggle } = useSortableData(result?.roi_scenarios || [], (r, k) => {
    switch (k) {
      case "name": return r.name;
      case "investment": return r.total_investment_eur;
      case "funding": return r.total_funding_eur;
      case "savings": return r.annual_savings_eur;
      case "roi": return r.roi_years;
      default: return null;
    }
  });
'''
    # Find handleAddProject and insert sort_logic after it
    content = content.replace('const handleAddProject = (rec: any, analysisId: string) => {', sort_logic + '\n  const handleAddProject = (rec: any, analysisId: string) => {')

    content = content.replace('<TableHead>Szenario</TableHead><TableHead className="text-right">Investition</TableHead>', '<SortableHead sortKey="name" current={roiSort} onToggle={roiToggle}>Szenario</SortableHead><SortableHead sortKey="investment" current={roiSort} onToggle={roiToggle} className="text-right">Investition</SortableHead>')
    content = content.replace('<TableHead className="text-right">Förderung</TableHead><TableHead className="text-right">Einsparung/Jahr</TableHead><TableHead className="text-right">ROI</TableHead>', '<SortableHead sortKey="funding" current={roiSort} onToggle={roiToggle} className="text-right">Förderung</SortableHead><SortableHead sortKey="savings" current={roiSort} onToggle={roiToggle} className="text-right">Einsparung/Jahr</SortableHead><SortableHead sortKey="roi" current={roiSort} onToggle={roiToggle} className="text-right">ROI</SortableHead>')
    
    content = content.replace('{result.roi_scenarios.map((sc, i) => (', '{sortedRoi.map((sc, i) => (')

    return content

update_file('src/pages/Copilot.tsx', update_copilot)
