import re
import sys

def update_file(path, update_func):
    with open(path, 'r') as f:
        content = f.read()
    new_content = update_func(content)
    with open(path, 'w') as f:
        f.write(new_content)

# 7. BillingTab.tsx
def update_billing_tab(content):
    if 'useSortableData' not in content:
        content = content.replace('import { Table,', 'import { SortableHead, useSortableData } from "@/components/ui/sortable-head";\nimport { Table,')

    # Two tables: runs and invoices
    
    # 1. Runs
    runs_sort = '''  type RunsSortKey = "period" | "status" | "generated" | "allocated" | "surplus";
  const { sorted: sortedRuns, sort: runsSort, toggle: runsToggle } = useSortableData(runs, (r, k) => {
    switch (k) {
      case "period": return r.period_start;
      case "status": return r.status;
      case "generated": return Number(r.total_generated_kwh ?? 0);
      case "allocated": return Number(r.total_allocated_kwh ?? 0);
      case "surplus": return Number(r.total_surplus_kwh ?? 0);
      default: return null;
    }
  });
'''
    # 2. Invoices
    invoices_sort = '''  type InvoicesSortKey = "period" | "member" | "kwh" | "amount" | "status";
  const { sorted: sortedInvoices, sort: invSort, toggle: invToggle } = useSortableData(invoices, (r, k) => {
    switch (k) {
      case "period": return r.period_start;
      case "member": return r.community_members?.display_name;
      case "kwh": return Number(r.allocated_kwh);
      case "amount": return Number(r.total_ct);
      case "status": return r.status;
      default: return null;
    }
  });
'''

    content = content.replace('  return (', runs_sort + invoices_sort + '\n  return (')

    # Runs table headers
    content = content.replace('<TableHead>Zeitraum</TableHead>', '<SortableHead sortKey="period" current={runsSort} onToggle={runsToggle}>Zeitraum</SortableHead>')
    content = content.replace('<TableHead>Status</TableHead>', '<SortableHead sortKey="status" current={runsSort} onToggle={runsToggle}>Status</SortableHead>')
    content = content.replace('<TableHead className="text-right">kWh erzeugt</TableHead>', '<SortableHead sortKey="generated" current={runsSort} onToggle={runsToggle} className="text-right">kWh erzeugt</SortableHead>')
    content = content.replace('<TableHead className="text-right">kWh zugeteilt</TableHead>', '<SortableHead sortKey="allocated" current={runsSort} onToggle={runsToggle} className="text-right">kWh zugeteilt</SortableHead>')
    content = content.replace('<TableHead className="text-right">Überschuss kWh</TableHead>', '<SortableHead sortKey="surplus" current={runsSort} onToggle={runsToggle} className="text-right">Überschuss kWh</SortableHead>')
    content = content.replace('{runs.slice(0, 6).map((r: any) => (', '{sortedRuns.map((r: any) => (')

    # Invoices table headers
    content = content.replace('<TableHead>Zeitraum</TableHead><TableHead>Mitglied</TableHead>', '<SortableHead sortKey="period" current={invSort} onToggle={invToggle}>Zeitraum</SortableHead><SortableHead sortKey="member" current={invSort} onToggle={invToggle}>Mitglied</SortableHead>')
    content = content.replace('<TableHead className="text-right">kWh</TableHead>', '<SortableHead sortKey="kwh" current={invSort} onToggle={invToggle} className="text-right">kWh</SortableHead>')
    content = content.replace('<TableHead className="text-right">Betrag</TableHead>', '<SortableHead sortKey="amount" current={invSort} onToggle={invToggle} className="text-right">Betrag</SortableHead>')
    content = content.replace('<TableHead>Status</TableHead>', '<SortableHead sortKey="status" current={invSort} onToggle={invToggle}>Status</SortableHead>')
    content = content.replace('{invoices.map((inv: any) => (', '{sortedInvoices.map((inv: any) => (')

    return content

# 8. ContractTemplatesTab.tsx
def update_contract_templates(content):
    if 'useSortableData' not in content:
        content = content.replace('import { Table,', 'import { SortableHead, useSortableData } from "@/components/ui/sortable-head";\nimport { Table,')

    sort_logic = '''  type SortKey = "name" | "type" | "validity" | "version" | "status";
  const { sorted, sort, toggle } = useSortableData(templates, (r, k) => {
    switch (k) {
      case "name": return r.name;
      case "type": return r.template_kind;
      case "validity": return r.community_id ? "c" : "m";
      case "version": return r.version;
      case "status": return r.is_active;
      default: return null;
    }
  });
'''
    content = content.replace('  return (', sort_logic + '\n  return (')

    content = content.replace('<TableHead>Name</TableHead>', '<SortableHead sortKey="name" current={sort} onToggle={toggle}>Name</SortableHead>')
    content = content.replace('<TableHead>Typ</TableHead>', '<SortableHead sortKey="type" current={sort} onToggle={toggle}>Typ</SortableHead>')
    content = content.replace('<TableHead>Gültigkeit</TableHead>', '<SortableHead sortKey="validity" current={sort} onToggle={toggle}>Gültigkeit</SortableHead>')
    content = content.replace('<TableHead>Version</TableHead>', '<SortableHead sortKey="version" current={sort} onToggle={toggle}>Version</SortableHead>')
    content = content.replace('<TableHead>Status</TableHead>', '<SortableHead sortKey="status" current={sort} onToggle={toggle}>Status</SortableHead>')
    content = content.replace('{templates.map((t) => (', '{sorted.map((t) => (')

    return content

update_file('src/components/energy-sharing/BillingTab.tsx', update_billing_tab)
update_file('src/components/energy-sharing/ContractTemplatesTab.tsx', update_contract_templates)
