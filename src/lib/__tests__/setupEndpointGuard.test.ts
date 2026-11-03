import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { resolveSessionKind } from "../../../supabase/functions/_shared/supportSessionKind";

const tenantId = "10000000-0000-4000-8000-000000000001";
async function invoke(tenantError: boolean, sessionError: boolean) {
  let handler: ((req: Request) => Promise<Response>) | undefined;
  let mutations = 0;
  let authCalls = 0;
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: "portal-admin" } } }),
      admin: { createUser: async () => { authCalls++; throw new Error("unexpected user creation"); } } },
    rpc: async () => ({ data: true }),
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: { id: tenantId, setup_status: "setup", remote_support_enabled: false }, error: tenantError ? { code: "42703" } : null }),
        limit: async () => ({ data: [], error: sessionError ? { code: "PGRST204" } : null }),
        insert: () => { mutations++; throw new Error(`unexpected insert ${table}`); },
      };
      return query;
    },
  };
  const source = readFileSync("supabase/functions/support-session-impersonate/index.ts", "utf8")
    .replace(/^import .*;\n/gm, "");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    Deno: { env: { get: () => "test-config" }, serve: (h: typeof handler) => { handler = h; } },
    createClient: () => client, corsHeaders: {}, resolveSessionKind,
    Response, Request, console, crypto,
  });
  if (!handler) throw new Error("handler not registered");
  const response = await handler(new Request("http://localhost/setup", {
    method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify({ target_tenant_id: tenantId }),
  }));
  return { response, mutations, authCalls };
}

describe("setup access requires deployed schema", () => {
  it("missing tenant setup column starts no support user or session", async () => {
    const result = await invoke(true, false);
    expect(result.response.status).toBe(503);
    expect(result.mutations).toBe(0);
    expect(result.authCalls).toBe(0);
  });
  it("missing session_kind in the API cache starts no support user or session", async () => {
    const result = await invoke(false, true);
    expect(result.response.status).toBe(503);
    expect(result.mutations).toBe(0);
    expect(result.authCalls).toBe(0);
  });
});