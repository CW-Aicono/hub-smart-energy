import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Wifi, Router, Cable, Search, Pencil } from "lucide-react";
import type { NetworkDevice } from "@/data/networkDemoData";

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
                  <TableHead>Typ</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Modell</TableHead>
                  <TableHead>IP-Adresse</TableHead>
                  <TableHead>MAC</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Clients</TableHead>
                  <TableHead className="text-right">PoE (W)</TableHead>
                  <TableHead className="text-right">Ports</TableHead>
                  <TableHead className="text-right">Uptime</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
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
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
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
