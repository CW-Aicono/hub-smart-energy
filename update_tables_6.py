import re
import sys

def update_file(path, update_func):
    with open(path, 'r') as f:
        content = f.read()
    new_content = update_func(content)
    with open(path, 'w') as f:
        f.write(new_content)

# Finish EnergySharing.tsx Tariff table
def finish_energy_sharing(content):
    content = content.replace('<TableHead>Gültig ab</TableHead><TableHead>Gültig bis</TableHead>', '<SortableHead sortKey="from" current={tariffSort} onToggle={tariffToggle}>Gültig ab</SortableHead><SortableHead sortKey="to" current={tariffSort} onToggle={tariffToggle}>Gültig bis</SortableHead>')
    content = content.replace('<TableHead className="text-right">Preis (ct/kWh)</TableHead>', '<SortableHead sortKey="price" current={tariffSort} onToggle={tariffToggle} className="text-right">Preis (ct/kWh)</SortableHead>')
    content = content.replace('<TableHead className="text-right">Einspeisung (ct/kWh)</TableHead>', '<SortableHead sortKey="feedin" current={tariffSort} onToggle={tariffToggle} className="text-right">Einspeisung (ct/kWh)</SortableHead>')
    content = content.replace('{tariffs.map((t) => (', '{sortedTariffs.map((t) => (')
    return content

update_file('src/pages/EnergySharing.tsx', finish_energy_sharing)
