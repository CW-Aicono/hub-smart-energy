import re
import sys

def update_file(path, update_func):
    with open(path, 'r') as f:
        content = f.read()
    new_content = update_func(content)
    with open(path, 'w') as f:
        f.write(new_content)

# 9. DataImportTab.tsx
def update_data_import(content):
    if 'useSortableData' not in content:
        content = content.replace('import { Table,', 'import { SortableHead, useSortableData } from "@/components/ui/sortable-head";\nimport { Table,')

    sort_logic = '''  type SortKey = "file" | "status" | "intervals" | "imported" | "skipped" | "date";
  const { sorted, sort, toggle } = useSortableData(imports, (r, k) => {
    switch (k) {
      case "file": return r.file_name;
      case "status": return r.status;
      case "intervals": return Number(r.parsed_intervals ?? 0);
      case "imported": return Number(r.rows_imported ?? 0);
      case "skipped": return Number(r.rows_skipped ?? 0);
      case "date": return r.created_at;
      default: return null;
    }
  });
'''
    content = content.replace('  return (', sort_logic + '\n  return (')

    content = content.replace('<TableHead>Datei</TableHead><TableHead>Status</TableHead>', '<SortableHead sortKey="file" current={sort} onToggle={toggle}>Datei</SortableHead><SortableHead sortKey="status" current={sort} onToggle={toggle}>Status</SortableHead>')
    content = content.replace('<TableHead className="text-right">Werte</TableHead>', '<SortableHead sortKey="intervals" current={sort} onToggle={toggle} className="text-right">Werte</SortableHead>')
    content = content.replace('<TableHead className="text-right">Importiert</TableHead>', '<SortableHead sortKey="imported" current={sort} onToggle={toggle} className="text-right">Importiert</SortableHead>')
    content = content.replace('<TableHead className="text-right">Übersprungen</TableHead>', '<SortableHead sortKey="skipped" current={sort} onToggle={toggle} className="text-right">Übersprungen</SortableHead>')
    content = content.replace('<TableHead>Zeitpunkt</TableHead>', '<SortableHead sortKey="date" current={sort} onToggle={toggle}>Zeitpunkt</SortableHead>')
    content = content.replace('{imports.map((i: any) => (', '{sorted.map((i: any) => (')

    return content

# 10. MarketplaceTab.tsx
def update_marketplace(content):
    if 'useSortableData' not in content:
        content = content.replace('import { Table,', 'import { SortableHead, useSortableData } from "@/components/ui/sortable-head";\nimport { Table,')

    # Listings table
    listings_sort = '''  type ListingsSortKey = "title" | "region" | "price" | "status" | "views";
  const { sorted: sortedListings, sort: listSort, toggle: listToggle } = useSortableData(listings, (r, k) => {
    switch (k) {
      case "title": return r.title;
      case "region": return `${r.region_plz} ${r.region_city}`;
      case "price": return Number(r.price_ct_kwh);
      case "status": return r.is_public;
      case "views": return Number(r.view_count);
      default: return null;
    }
  });
'''
    # Requests table
    requests_sort = '''  type RequestsSortKey = "date" | "name" | "email" | "phone" | "status";
  const { sorted: sortedRequests, sort: reqSort, toggle: reqToggle } = useSortableData(requests, (r, k) => {
    switch (k) {
      case "date": return r.created_at;
      case "name": return r.name;
      case "email": return r.email;
      case "phone": return r.phone;
      case "status": return r.status;
      default: return null;
    }
  });
'''
    content = content.replace('  return (', listings_sort + requests_sort + '\n  return (')

    content = content.replace('<TableHead>Titel</TableHead>', '<SortableHead sortKey="title" current={listSort} onToggle={listToggle}>Titel</SortableHead>')
    content = content.replace('<TableHead>Region</TableHead>', '<SortableHead sortKey="region" current={listSort} onToggle={listToggle}>Region</SortableHead>')
    content = content.replace('<TableHead className="text-right">Preis</TableHead>', '<SortableHead sortKey="price" current={listSort} onToggle={listToggle} className="text-right">Preis</SortableHead>')
    content = content.replace('<TableHead>Status</TableHead>', '<SortableHead sortKey="status" current={listSort} onToggle={listToggle}>Status</SortableHead>')
    content = content.replace('<TableHead className="text-right">\n                    <Eye className="h-3 w-3 inline" /> Aufrufe\n                  </TableHead>', '<SortableHead sortKey="views" current={listSort} onToggle={listToggle} className="text-right">Aufrufe</SortableHead>')
    content = content.replace('{listings.map((l) => (', '{sortedListings.map((l) => (')

    content = content.replace('<TableHead>Datum</TableHead>', '<SortableHead sortKey="date" current={reqSort} onToggle={reqToggle}>Datum</SortableHead>')
    content = content.replace('<TableHead>Name</TableHead>', '<SortableHead sortKey="name" current={reqSort} onToggle={reqToggle}>Name</SortableHead>')
    content = content.replace('<TableHead>E-Mail</TableHead>', '<SortableHead sortKey="email" current={reqSort} onToggle={reqToggle}>E-Mail</SortableHead>')
    content = content.replace('<TableHead>Telefon</TableHead>', '<SortableHead sortKey="phone" current={reqSort} onToggle={reqToggle}>Telefon</SortableHead>')
    content = content.replace('<TableHead>Status</TableHead>', '<SortableHead sortKey="status" current={reqSort} onToggle={reqToggle}>Status</SortableHead>')
    content = content.replace('{requests.map((r) => (', '{sortedRequests.map((r) => (')

    return content

update_file('src/components/energy-sharing/DataImportTab.tsx', update_data_import)
update_file('src/components/energy-sharing/MarketplaceTab.tsx', update_marketplace)
