import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, Wifi, Router, Cable, Activity } from "lucide-react";
import type { NetworkDevice } from "@/data/networkDemoData";

interface Props {
  devices: NetworkDevice[];
}

export default function NetworkOverview({ devices }: Props) {
  const gateways = devices.filter((d) => d.type === "gateway");
  const aps = devices.filter((d) => d.type === "access_point");
  const switches = devices.filter((d) => d.type === "switch");

  return (
    <div className="space-y-4">
      {/* Floor plan placement hint */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Grundriss-Ansicht
          </CardTitle>
          <CardDescription>
            Platzieren Sie Netzwerkgeräte auf Ihrem Gebäude-Grundriss, um eine räumliche Übersicht zu erhalten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-border rounded-lg p-8 bg-muted/30">
            <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
              {/* Grid background */}
              <div className="absolute inset-0 opacity-10" style={{
                backgroundImage: "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }} />
              {/* Simulated rooms */}
              <div className="absolute top-[5%] left-[5%] w-[40%] h-[45%] border border-border rounded bg-background/60 flex items-center justify-center">
                <span className="text-xs text-muted-foreground">Empfang / Foyer</span>
              </div>
              <div className="absolute top-[5%] left-[48%] w-[47%] h-[45%] border border-border rounded bg-background/60 flex items-center justify-center">
                <span className="text-xs text-muted-foreground">Großraumbüro</span>
              </div>
              <div className="absolute top-[55%] left-[5%] w-[28%] h-[40%] border border-border rounded bg-background/60 flex items-center justify-center">
                <span className="text-xs text-muted-foreground">Server-Raum</span>
              </div>
              <div className="absolute top-[55%] left-[36%] w-[28%] h-[40%] border border-border rounded bg-background/60 flex items-center justify-center">
                <span className="text-xs text-muted-foreground">Konferenz</span>
              </div>
              <div className="absolute top-[55%] left-[67%] w-[28%] h-[40%] border border-border rounded bg-background/60 flex items-center justify-center">
                <span className="text-xs text-muted-foreground">Lager</span>
              </div>

              {/* Placed devices */}
              <DevicePin x="20%" y="22%" device={aps[0]} />
              <DevicePin x="72%" y="20%" device={aps[1]} />
              <DevicePin x="50%" y="72%" device={aps[2]} />
              <DevicePin x="82%" y="72%" device={aps[3]} />
              <DevicePin x="18%" y="72%" device={switches[0]} />
              <DevicePin x="12%" y="12%" device={gateways[0]} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Device summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <DeviceGroupCard
          icon={<Router className="h-5 w-5 text-primary" />}
          title="Gateways"
          devices={gateways}
        />
        <DeviceGroupCard
          icon={<Wifi className="h-5 w-5 text-primary" />}
          title="Access Points"
          devices={aps}
        />
        <DeviceGroupCard
          icon={<Cable className="h-5 w-5 text-primary" />}
          title="Switches"
          devices={switches}
        />
      </div>
    </div>
  );
}

function DevicePin({ x, y, device }: { x: string; y: string; device?: NetworkDevice }) {
  if (!device) return null;
  const isOnline = device.status === "online";
  const Icon = device.type === "access_point" ? Wifi : device.type === "switch" ? Cable : Router;

  return (
    <div
      className="absolute z-10 group"
      style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
    >
      <div className={`relative p-1.5 rounded-full border-2 ${isOnline ? "border-primary bg-primary/10" : "border-muted-foreground/40 bg-muted"}`}>
        <Icon className={`h-4 w-4 ${isOnline ? "text-primary" : "text-muted-foreground"}`} />
        {isOnline && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
        )}
      </div>
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20">
        <div className="bg-popover text-popover-foreground border border-border rounded-lg shadow-lg p-2.5 text-xs whitespace-nowrap">
          <p className="font-semibold">{device.name}</p>
          <p className="text-muted-foreground">{device.model} · {device.ip}</p>
          {device.clients !== undefined && <p>{device.clients} Clients verbunden</p>}
          {device.poeConsumption !== undefined && device.poeConsumption > 0 && (
            <p className="flex items-center gap-1"><Activity className="h-3 w-3" /> {device.poeConsumption} W PoE</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DeviceGroupCard({ icon, title, devices }: { icon: React.ReactNode; title: string; devices: NetworkDevice[] }) {
  const online = devices.filter((d) => d.status === "online").length;
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-semibold text-foreground">{title}</span>
          </div>
          <Badge variant="outline">{online}/{devices.length} online</Badge>
        </div>
        <div className="space-y-2">
          {devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-sm">
              <span className="text-foreground">{d.name}</span>
              <span className={`text-xs ${d.status === "online" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                {d.status === "online" ? "●" : "○"} {d.status === "online" ? "Online" : "Offline"}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
