import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
async function invoke({ cpError = false, recordsError = false, internal = true, permitted = true } = {}) {
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const writes: unknown[] = [];
  const client = { from: (table: string) => {
    const q = { select: (cols: string) => { if (cols.includes("serial_number")) throw new Error("missing column"); return q; }, eq: () => q,
      single: async () => ({ data: { id: "session", tenant_id: "tenant", charge_point_id: "cp", start_time: "2026-11-01T00:00:00Z", stop_time: "2026-11-01T01:00:00Z", meter_start: 1000, meter_stop: 2000 } }),
      maybeSingle: async () => table === "charging_sessions" ? { data: permitted ? { id: "session" } : null } : { data: { vendor: "Vestel", model: "Gemini", eichrecht_enabled: true }, error: cpError ? { message: "unavailable" } : null },
      order: async () => ({ data: [], error: recordsError ? { message: "unavailable" } : null }),
      update: (payload: unknown) => { writes.push(payload); return { eq: async () => ({ error: null }) }; },
    }; return q;
  }};
  const source = readFileSync("supabase/functions/ocmf-finalize/index.ts", "utf8").replace(/^import .*;\n/gm, "");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    Deno: { env: { get: () => "test" }, serve: (h: typeof handler) => { handler = h; } }, createClient: () => client,
    requireInternalOrUser: async () => null, isInternalCaller: () => internal, Response, Request, console, crypto,
  });
  if (!handler) throw new Error("handler missing");
  const response = await handler(new Request("http://localhost", { method: "POST", body: JSON.stringify({ session_id: "session" }) }));
  return { response, writes };
}
describe("OCMF finalization", () => {
  it("finalizes using existing columns and never labels an unsigned stub as signed", async () => {
    const r = await invoke(); expect(r.response.status).toBe(200);
    expect(r.writes).toHaveLength(1); expect(r.writes[0]).toMatchObject({ ocmf_status: "unsigned" });
  });
  it("does not overwrite evidence when charge-point configuration cannot be read", async () => {
    const r = await invoke({ cpError: true }); expect(r.response.status).toBe(500); expect(r.writes).toEqual([]);
  });
  it("does not overwrite evidence when meter records cannot be read", async () => {
    const r = await invoke({ recordsError: true }); expect(r.response.status).toBe(500); expect(r.writes).toEqual([]);
  });
  it("rejects a signed-in user without RLS access to the session", async () => {
    const r = await invoke({ internal: false, permitted: false }); expect(r.response.status).toBe(403); expect(r.writes).toEqual([]);
  });
});