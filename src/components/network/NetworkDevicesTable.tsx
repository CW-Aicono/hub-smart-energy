import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Wifi, Router, Cable, Search, Pencil, ArrowUp, ArrowDown } from "lucide-react";
import { type NetworkDevice, formatBytes, formatRate } from "@/data/networkDemoData";

interface Props {
  devices: NetworkDevice[];
  onUpdateDevice: (device: NetworkDevice) => void;
}

const typeIcon = (type: NetworkDevice["type"]) => {
  switch (type) {
    case "gateway": return <Router className="h-4 w-4 text-primary" />;
    case "access_point": return <Wifi className="h-4 w-4 text-primary" />;
    case "switch": return <Cable className="h-4 w-4 text-primary" />;
  }
};

const typeLabel = (type: NetworkDevice["type"]) => {
  switch (type) {
    case "gateway": return "Gateway";
    case "access_point": return "Access Point";
    case "switch": return "Switch";
  }
};

export default function NetworkDevicesTable({ devices, onUpdateDevice }: Props) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [editDevice, setEditDevice] = useState<NetworkDevice | null>(null);
  const [editName, setEditName] = useState("");

  const filtered = devices.filter((d) => {
    const matchSearch =
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.ip.includes(search) ||
      d.mac.toLowerCase().includes(search.toLowerCase()) ||
      d.model.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || d.type === typeFilter;
    return matchSearch && matchType;
  });
  type SortKey = "type" | "name" | "model" | "ip" | "mac" | "status" | "clients" | "poe" | "tx" | "rx" | "rate" | "ports" | "uptime";
  const { sorted, sort, toggle } = useSortableData<NetworkDevice, SortKey>(filtered, (d, k) => {
    switch (k) {
      case "type": return d.type;
      case "name": return d.name;
      case "model": return d.model;
      case "ip": return d.ip;
      case "mac": return d.mac;
      case "status": return d.status;
      case "clients": return d.clients ?? 0;
      case "poe": return d.poeConsumption ?? 0;
      case "tx": return d.traffic?.txBytes ?? 0;
      case "rx": return d.traffic?.rxBytes ?? 0;
      case "rate": return (d.traffic?.txRate ?? 0) + (d.traffic?.rxRate ?? 0);
      case "ports": return d.ports ?? 0;
      case "uptime": return d.uptime;
      default: return null;
    }
  });


  const openEdit = (device: NetworkDevice) => {
    setEditDevice(device);
    setEditName(device.name);
  };

  const saveEdit = () => {
    if (editDevice) {
      onUpdateDevice({ ...editDevice, name: editName });
      setEditDevice(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cable className="h-5 w-5" />
            Netzwerkgeräte
          </CardTitle>
          <CardDescription>
            Controller, Access Points und Switches aus Ihren Omada-Controllern
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Name, IP, MAC oder Modell suchen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Alle Typen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                <SelectItem value="gateway">Gateways</SelectItem>
                <SelectItem value="access_point">Access Points</SelectItem>
                <SelectItem value="switch">Switches</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Typ" sortKey="type" sort={sort} onToggle={toggle} />
                  <SortableHead label="Name" sortKey="name" sort={sort} onToggle={toggle} />
                  <SortableHead label="Modell" sortKey="model" sort={sort} onToggle={toggle} />
                  <SortableHead label="IP-Adresse" sortKey="ip" sort={sort} onToggle={toggle} />
                  <SortableHead label="MAC" sortKey="mac" sort={sort} onToggle={toggle} />
                  <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                  <SortableHead label="Clients" sortKey="clients" sort={sort} onToggle={toggle} />
                  <SortableHead label="PoE (W)" sortKey="poe" sort={sort} onToggle={toggle} />
                  <SortableHead label="Traffic ↑" sortKey="tx" sort={sort} onToggle={toggle} />
                  <SortableHead label="Traffic ↓" sortKey="rx" sort={sort} onToggle={toggle} />
                  <SortableHead label="Rate" sortKey="rate" sort={sort} onToggle={toggle} />
                  <SortableHead label="Ports" sortKey="ports" sort={sort} onToggle={toggle} />
                  <SortableHead label="Uptime" sortKey="uptime" sort={sort} onToggle={toggle} />
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{typeIcon(d.type)}</TableCell>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="text-muted-foreground">{d.model}</TableCell>
                    <TableCell className="font-mono text-sm">{d.ip}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{d.mac}</TableCell>
                    <TableCell>
                      <Badge variant={d.status === "online" ? "default" : "secondary"}>
                        {d.status === "online" ? "Online" : d.status === "offline" ? "Offline" : "Ausstehend"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{d.clients ?? "–"}</TableCell>
                    <TableCell className="text-right">{d.poeConsumption ? `${d.poeConsumption}` : "–"}</TableCell>
                    <TableCell className="text-right text-xs">{d.traffic ? formatBytes(d.traffic.txBytes) : "–"}</TableCell>
                    <TableCell className="text-right text-xs">{d.traffic ? formatBytes(d.traffic.rxBytes) : "–"}</TableCell>
                    <TableCell className="text-right text-xs">
                      {d.traffic && d.traffic.txRate > 0 ? (
                        <span className="flex items-center justify-end gap-1">
                          <ArrowUp className="h-3 w-3 text-muted-foreground" />{formatRate(d.traffic.txRate)}
                          <ArrowDown className="h-3 w-3 text-muted-foreground ml-1" />{formatRate(d.traffic.rxRate)}
                        </span>
                      ) : "–"}
                    </TableCell>
                    <TableCell className="text-right">
                      {d.ports ? `${d.portsUsed ?? 0}/${d.ports}` : "–"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">{d.uptime}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                      Keine Geräte gefunden.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editDevice} onOpenChange={(o) => !o && setEditDevice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editDevice && typeIcon(editDevice.type)}
              Gerät bearbeiten
            </DialogTitle>
          </DialogHeader>
          {editDevice && (
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Typ</Label>
                  <p className="text-sm mt-1">{typeLabel(editDevice.type)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Modell</Label>
                  <p className="text-sm mt-1">{editDevice.model}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">IP-Adresse</Label>
                  <p className="text-sm font-mono mt-1">{editDevice.ip}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">MAC-Adresse</Label>
                  <p className="text-sm font-mono mt-1">{editDevice.mac}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Firmware</Label>
                  <p className="text-sm mt-1">{editDevice.firmware}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Uptime</Label>
                  <p className="text-sm mt-1">{editDevice.uptime}</p>
                </div>
              </div>
              {editDevice.traffic && (
                <div className="border-t border-border pt-4">
                  <Label className="text-muted-foreground text-xs">Traffic-Statistiken</Label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="flex items-center gap-1.5 text-sm">
                      <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Upload:</span>
                      <span className="font-medium">{formatBytes(editDevice.traffic.txBytes)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Download:</span>
                      <span className="font-medium">{formatBytes(editDevice.traffic.rxBytes)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Aktuell:</span>
                      <span className="font-medium">{formatRate(editDevice.traffic.txRate)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Aktuell:</span>
                      <span className="font-medium">{formatRate(editDevice.traffic.rxRate)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDevice(null)}>Abbrechen</Button>
            <Button onClick={saveEdit}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
