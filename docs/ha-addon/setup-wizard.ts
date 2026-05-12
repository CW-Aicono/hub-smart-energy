/**
 * AICONO EMS Gateway – Captive Setup Wizard
 * ==========================================
 * Mini-HTTP-Server (Port 8099, Pfad /setup), der beim ersten Boot startet,
 * solange in /data/options.json keine Credentials hinterlegt sind.
 *
 * Aufgaben:
 *   1. Pairing-Token (8-stellig, ABCD-1234) entgegennehmen
 *   2. Token gegen Cloud-Endpoint POST /functions/v1/gateway-pair einlösen
 *      → erhält gateway_username + gateway_password (rotiert) + tenant_id
 *   3. /data/options.json schreiben und Add-on neu starten
 *   4. mDNS-Hostname `aicono.local` über Avahi-Service annoncieren
 *
 * Wird von index.ts beim Boot vor dem Haupt-Loop aufgerufen:
 *   if (!config.gateway_username || !config.gateway_password) {
 *     await runSetupWizard(); // blockiert bis Pairing erfolgreich
 *   }
 *
 * Nach erfolgreichem Pairing wird der Wizard beendet und der reguläre
 * Gateway-Prozess übernimmt Port 8099.
 */

import http from "http";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";

const OPTIONS_PATH = "/data/options.json";
const DEFAULT_CLOUD = "https://xnveugycurplszevdxtw.supabase.co";
const SUPABASE_ANON =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhudmV1Z3ljdXJwbHN6ZXZkeHR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MzQ1NzIsImV4cCI6MjA4NjExMDU3Mn0.iWwhILBtqhXomHTYr3jtFh-KKhbCOuDnLnCYvUmr1nw";

interface AddonOptions {
  gateway_username?: string;
  gateway_password?: string;
  tenant_id?: string;
  device_name?: string;
  cloud_url?: string;
  [key: string]: unknown;
}

function readOptions(): AddonOptions {
  try {
    return JSON.parse(fs.readFileSync(OPTIONS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeOptions(next: AddonOptions): void {
  fs.writeFileSync(OPTIONS_PATH, JSON.stringify(next, null, 2));
}

/** True wenn Wizard laufen muss. */
export function needsSetup(opts: AddonOptions = readOptions()): boolean {
  return !opts.gateway_username || !opts.gateway_password;
}

/** Erste nicht-loopback IPv4-Adresse für QR-Code/Anzeige. */
function localIPv4(): string {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return "0.0.0.0";
}

/** mDNS-Annoncierung als `aicono.local` via Avahi (vom Image vorinstalliert). */
function announceMdns(): void {
  const service = `<?xml version="1.0" standalone='no'?>
<service-group>
  <name replace-wildcards="yes">AICONO Hub</name>
  <service>
    <type>_http._tcp</type>
    <port>8099</port>
    <txt-record>path=/setup</txt-record>
  </service>
</service-group>`;
  try {
    fs.mkdirSync("/etc/avahi/services", { recursive: true });
    fs.writeFileSync("/etc/avahi/services/aicono.service", service);
    // Hostname setzen – Avahi nimmt /etc/hostname als Basis
    fs.writeFileSync("/etc/hostname", "aicono\n");
    execSync("hostnamectl set-hostname aicono || true", { stdio: "ignore" });
    execSync("systemctl reload avahi-daemon || service avahi-daemon reload || true", { stdio: "ignore" });
  } catch (e) {
    console.warn("[setup] mDNS-Konfiguration fehlgeschlagen:", (e as Error).message);
  }
}

const HTML = (ip: string) => `<!doctype html>
<html lang="de"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AICONO Hub – Einrichtung</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 460px; margin: 40px auto; padding: 0 20px; }
  h1 { font-size: 1.4rem; margin-bottom: .25rem; }
  p.sub { color: #666; margin-top: 0; }
  label { display: block; margin: 1rem 0 .25rem; font-weight: 500; }
  input { width: 100%; padding: .75rem; font-size: 1.25rem; letter-spacing: .15rem;
          text-align: center; text-transform: uppercase; border: 1px solid #ccc; border-radius: 8px; }
  button { width: 100%; padding: .85rem; margin-top: 1.25rem; font-size: 1rem; font-weight: 600;
           background: #0a84ff; color: white; border: 0; border-radius: 8px; cursor: pointer; }
  button:disabled { opacity: .5; cursor: wait; }
  .err { color: #d33; margin-top: 1rem; min-height: 1.2em; font-size: .9rem; }
  .ok  { color: #2a7; margin-top: 1rem; font-size: .95rem; }
  .meta { margin-top: 2rem; font-size: .8rem; color: #888; text-align: center; }
</style></head>
<body>
  <h1>AICONO Hub einrichten</h1>
  <p class="sub">Gib den 8-stelligen Pairing-Code aus deinem AICONO-Backend ein.</p>
  <form id="f">
    <label for="t">Pairing-Code</label>
    <input id="t" name="token" placeholder="ABCD-1234" required autocomplete="off" autofocus maxlength="9"/>
    <button id="b" type="submit">Hub verbinden</button>
    <div id="msg" class="err"></div>
  </form>
  <div class="meta">aicono.local · ${ip}:8099</div>
<script>
  const f = document.getElementById('f'), b = document.getElementById('b'), m = document.getElementById('msg');
  f.onsubmit = async (e) => {
    e.preventDefault();
    m.textContent = ''; m.className = 'err'; b.disabled = true;
    const token = document.getElementById('t').value.trim().toUpperCase();
    try {
      const r = await fetch('/setup/pair', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ token })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Pairing fehlgeschlagen');
      m.className = 'ok';
      m.textContent = '✔ Verbunden – Hub startet neu …';
      setTimeout(() => location.reload(), 4000);
    } catch (err) {
      m.textContent = err.message;
      b.disabled = false;
    }
  };
</script></body></html>`;

async function pairWithCloud(token: string, mac: string, deviceName: string, cloudUrl: string) {
  const res = await fetch(`${cloudUrl}/functions/v1/gateway-pair`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
    },
    body: JSON.stringify({ token: token.replace(/-/g, ""), mac, device_name: deviceName }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as { gateway_username: string; gateway_password: string; tenant_id: string };
}

function primaryMac(): string {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (!i.internal && i.mac && i.mac !== "00:00:00:00:00:00") return i.mac.toLowerCase();
    }
  }
  return "";
}

export function runSetupWizard(port = 8099): Promise<void> {
  announceMdns();
  const ip = localIPv4();
  const mac = primaryMac();
  console.log(`[setup] Captive-Wizard läuft auf http://${ip}:${port}/setup (mDNS: http://aicono.local:${port}/setup)`);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = req.url || "/";
      if (req.method === "GET" && (url === "/" || url.startsWith("/setup"))) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(HTML(ip));
        return;
      }
      if (req.method === "POST" && url === "/setup/pair") {
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", async () => {
          try {
            const { token } = JSON.parse(raw || "{}");
            if (!token || typeof token !== "string") throw new Error("Kein Token übergeben");
            const opts = readOptions();
            const cloud = (opts.cloud_url as string) || DEFAULT_CLOUD;
            const deviceName = (opts.device_name as string) || `aicono-${mac.slice(-5).replace(":", "")}`;
            const paired = await pairWithCloud(token, mac, deviceName, cloud);
            writeOptions({
              ...opts,
              gateway_username: paired.gateway_username,
              gateway_password: paired.gateway_password,
              device_name: deviceName,
              cloud_url: cloud,
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
            console.log("[setup] ✔ Pairing erfolgreich – beende Wizard, Add-on startet neu.");
            setTimeout(() => {
              server.close();
              resolve();
              // Add-on-Supervisor startet uns automatisch neu, sobald wir exit(0)en
              process.exit(0);
            }, 1500);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: (e as Error).message }));
          }
        });
        return;
      }
      res.writeHead(404).end();
    });
    server.on("error", reject);
    server.listen(port, "0.0.0.0");
  });
}
