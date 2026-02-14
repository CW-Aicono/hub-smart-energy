export interface TrafficStats {
  txBytes: number;  // bytes total
  rxBytes: number;  // bytes total
  txRate: number;   // bytes/s current
  rxRate: number;   // bytes/s current
}

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
  traffic?: TrafficStats;
  floorId?: string;
  positionX?: number;
  positionY?: number;
}

/** Format bytes to human readable */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

/** Format bytes/s to human readable rate */
export function formatRate(bytesPerSec: number): string {
  if (bytesPerSec === 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(1024));
  return `${(bytesPerSec / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
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
    traffic: { txBytes: 482_000_000_000, rxBytes: 1_230_000_000_000, txRate: 12_500_000, rxRate: 45_800_000 },
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
    traffic: { txBytes: 89_000_000_000, rxBytes: 42_000_000_000, txRate: 3_200_000, rxRate: 1_800_000 },
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
    traffic: { txBytes: 156_000_000_000, rxBytes: 78_000_000_000, txRate: 5_600_000, rxRate: 2_400_000 },
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
    traffic: { txBytes: 12_000_000_000, rxBytes: 5_400_000_000, txRate: 890_000, rxRate: 320_000 },
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
    traffic: { txBytes: 0, rxBytes: 0, txRate: 0, rxRate: 0 },
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
    traffic: { txBytes: 3_400_000_000_000, rxBytes: 2_100_000_000_000, txRate: 78_000_000, rxRate: 52_000_000 },
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
    traffic: { txBytes: 890_000_000_000, rxBytes: 620_000_000_000, txRate: 24_000_000, rxRate: 18_000_000 },
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
    traffic: { txBytes: 450_000_000_000, rxBytes: 310_000_000_000, txRate: 15_000_000, rxRate: 11_000_000 },
  },
];
