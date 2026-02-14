export interface NetworkDevice {
  id: string;
  name: string;
  type: "gateway" | "access_point" | "switch";
  model: string;
  mac: string;
  ip: string;
  status: "online" | "offline" | "pending";
  site: string;
  firmware: string;
  uptime: string;
  clients?: number;
  poeConsumption?: number; // Watts
  ports?: number;
  portsUsed?: number;
  band?: string;
  channel?: number;
  txPower?: number;
  floorId?: string;
  positionX?: number;
  positionY?: number;
}

export const DEMO_NETWORK_DEVICES: NetworkDevice[] = [
  // Gateways
  {
    id: "gw_1",
    name: "Gateway Hauptgebäude",
    type: "gateway",
    model: "ER7206",
    mac: "AA:BB:CC:11:22:01",
    ip: "192.168.1.1",
    status: "online",
    site: "Hauptstandort",
    firmware: "1.4.1",
    uptime: "34d 12h",
    ports: 6,
    portsUsed: 4,
  },
  // Access Points
  {
    id: "ap_1",
    name: "AP Empfang EG",
    type: "access_point",
    model: "EAP670",
    mac: "AA:BB:CC:22:33:01",
    ip: "192.168.1.10",
    status: "online",
    site: "Hauptstandort",
    firmware: "1.2.6",
    uptime: "34d 12h",
    clients: 18,
    poeConsumption: 20.5,
    band: "Wi-Fi 6 (2.4/5 GHz)",
    channel: 36,
    txPower: 23,
  },
  {
    id: "ap_2",
    name: "AP Büro 1. OG",
    type: "access_point",
    model: "EAP660 HD",
    mac: "AA:BB:CC:22:33:02",
    ip: "192.168.1.11",
    status: "online",
    site: "Hauptstandort",
    firmware: "1.2.6",
    uptime: "34d 12h",
    clients: 24,
    poeConsumption: 25.3,
    band: "Wi-Fi 6 (2.4/5 GHz)",
    channel: 44,
    txPower: 20,
  },
  {
    id: "ap_3",
    name: "AP Konferenz 2. OG",
    type: "access_point",
    model: "EAP615-Wall",
    mac: "AA:BB:CC:22:33:03",
    ip: "192.168.1.12",
    status: "online",
    site: "Hauptstandort",
    firmware: "1.1.0",
    uptime: "12d 8h",
    clients: 6,
    poeConsumption: 11.2,
    band: "Wi-Fi 6 (2.4/5 GHz)",
    channel: 1,
    txPower: 17,
  },
  {
    id: "ap_4",
    name: "AP Lager",
    type: "access_point",
    model: "EAP225-Outdoor",
    mac: "AA:BB:CC:22:33:04",
    ip: "192.168.1.13",
    status: "offline",
    site: "Hauptstandort",
    firmware: "1.0.3",
    uptime: "–",
    clients: 0,
    poeConsumption: 0,
    band: "Wi-Fi 5 (2.4/5 GHz)",
    channel: 6,
    txPower: 20,
  },
  // Switches
  {
    id: "sw_1",
    name: "Switch Server-Raum",
    type: "switch",
    model: "TL-SG3428XMP",
    mac: "AA:BB:CC:33:44:01",
    ip: "192.168.1.2",
    status: "online",
    site: "Hauptstandort",
    firmware: "1.6.2",
    uptime: "34d 12h",
    ports: 28,
    portsUsed: 22,
    poeConsumption: 187.4,
  },
  {
    id: "sw_2",
    name: "Switch EG Verteiler",
    type: "switch",
    model: "TL-SG2210MP",
    mac: "AA:BB:CC:33:44:02",
    ip: "192.168.1.3",
    status: "online",
    site: "Hauptstandort",
    firmware: "1.6.2",
    uptime: "34d 12h",
    ports: 10,
    portsUsed: 8,
    poeConsumption: 62.8,
  },
  {
    id: "sw_3",
    name: "Switch 1. OG",
    type: "switch",
    model: "TL-SG2210MP",
    mac: "AA:BB:CC:33:44:03",
    ip: "192.168.1.4",
    status: "online",
    site: "Hauptstandort",
    firmware: "1.5.1",
    uptime: "20d 3h",
    ports: 10,
    portsUsed: 7,
    poeConsumption: 45.1,
  },
];
