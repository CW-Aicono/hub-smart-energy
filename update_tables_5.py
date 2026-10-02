import re
import sys

def update_file(path, update_func):
    with open(path, 'r') as f:
        content = f.read()
    new_content = update_func(content)
    with open(path, 'w') as f:
        f.write(new_content)

# 11. EnergySharing.tsx
def update_energy_sharing(content):
    if 'useSortableData' not in content:
        content = content.replace('import { Table,', 'import { SortableHead, useSortableData } from "@/components/ui/sortable-head";\nimport { Table,')

    # MembersTab
    members_sort = '''  type MemberSortKey = "name" | "role" | "class" | "imsys" | "share" | "status";
  const { sorted: sortedMembers, sort: memberSort, toggle: memberToggle } = useSortableData(members, (r, k) => {
    switch (k) {
      case "name": return r.display_name;
      case "role": return r.role;
      case "class": return r.customer_class;
      case "imsys": return r.imsys_status;
      case "share": return Number(r.share_kw);
      case "status": return r.status;
      default: return null;
    }
  });
'''
    # Find MembersTab and insert sort logic
    # pattern = r'function MembersTab\(.*?\) \{'
    # This is inside EnergySharing.tsx.
    
    # 1. Members table
    content = content.replace('<TableHead>Name</TableHead><TableHead>Rolle</TableHead><TableHead>Klasse</TableHead>', '<SortableHead sortKey="name" current={memberSort} onToggle={memberToggle}>Name</SortableHead><SortableHead sortKey="role" current={memberSort} onToggle={memberToggle}>Rolle</SortableHead><SortableHead sortKey="class" current={memberSort} onToggle={memberToggle}>Klasse</SortableHead>')
    content = content.replace('<TableHead>iMSys</TableHead>', '<SortableHead sortKey="imsys" current={memberSort} onToggle={memberToggle}>iMSys</SortableHead>')
    content = content.replace('<TableHead className="text-right">Anteil (kW)</TableHead>', '<SortableHead sortKey="share" current={memberSort} onToggle={memberToggle} className="text-right">Anteil (kW)</SortableHead>')
    content = content.replace('<TableHead>Status</TableHead>', '<SortableHead sortKey="status" current={memberSort} onToggle={memberToggle}>Status</SortableHead>')
    content = content.replace('{members.map((m) => (', '{sortedMembers.map((m) => (')

    # 2. Assets table
    assets_sort = '''  type AssetSortKey = "type" | "building" | "capacity" | "model" | "imsys" | "renewable";
  const { sorted: sortedAssets, sort: assetSort, toggle: assetToggle } = useSortableData(assets, (r, k) => {
    switch (k) {
      case "type": return r.asset_type;
      case "building": return r.building_type;
      case "capacity": return Number(r.capacity_kw);
      case "model": return r.share_model;
      case "imsys": return r.imsys_status;
      case "renewable": return r.renewable_confirmed;
      default: return null;
    }
  });
'''
    content = content.replace('<TableHead>Typ</TableHead><TableHead>Gebäude</TableHead>', '<SortableHead sortKey="type" current={assetSort} onToggle={assetToggle}>Typ</SortableHead><SortableHead sortKey="building" current={assetSort} onToggle={assetToggle}>Gebäude</SortableHead>')
    content = content.replace('<TableHead className="text-right">Leistung (kW)</TableHead>', '<SortableHead sortKey="capacity" current={assetSort} onToggle={assetToggle} className="text-right">Leistung (kW)</SortableHead>')
    content = content.replace('<TableHead>Verteilmodell</TableHead><TableHead>iMSys</TableHead>', '<SortableHead sortKey="model" current={assetSort} onToggle={assetToggle}>Verteilmodell</SortableHead><SortableHead sortKey="imsys" current={assetSort} onToggle={assetToggle}>iMSys</SortableHead>')
    content = content.replace('<TableHead>EE</TableHead>', '<SortableHead sortKey="renewable" current={assetSort} onToggle={assetToggle}>EE</SortableHead>')
    content = content.replace('{assets.map((a) => {', '{sortedAssets.map((a) => {')

    # 3. Tariff table
    tariff_sort = '''  type TariffSortKey = "from" | "to" | "price" | "feedin";
  const { sorted: sortedTariffs, sort: tariffSort, toggle: tariffToggle } = useSortableData(tariffs, (r, k) => {
    switch (k) {
      case "from": return r.valid_from;
      case "to": return r.valid_to;
      case "price": return Number(r.price_ct_kwh);
      case "feedin": return Number(r.feed_in_ct_kwh);
      default: return null;
    }
  });
'''
    # We need to find the Table in TariffTab. I need to read the end of the file.
    
    # Insert sort logic at start of functions
    content = content.replace('const { members, createMember, updateMember, deleteMember } = useCommunityMembers(communityId);', 'const { members, createMember, updateMember, deleteMember } = useCommunityMembers(communityId);\n' + members_sort)
    content = content.replace('const { assets, createAsset, updateAsset, deleteAsset } = useCommunityAssets(communityId);', 'const { assets, createAsset, updateAsset, deleteAsset } = useCommunityAssets(communityId);\n' + assets_sort)
    content = content.replace('const { tariffs, createTariff, updateTariff, deleteTariff } = useCommunityTariffs(communityId);', 'const { tariffs, createTariff, updateTariff, deleteTariff } = useCommunityTariffs(communityId);\n' + tariff_sort)

    return content

update_file('src/pages/EnergySharing.tsx', update_energy_sharing)
