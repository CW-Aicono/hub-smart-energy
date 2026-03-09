import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;

Deno.test("invite-tenant-admin returns error without auth", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-tenant-admin`, {
    method: "POST",
    body: JSON.stringify({}),
    headers: {
      "Content-Type": "application/json",
    },
  });
  const body = await res.json();
  assertEquals(res.status, 400);
  assertExists(body.error);
});

Deno.test("invite-tenant-admin returns error with missing params", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-tenant-admin`, {
    method: "POST",
    body: JSON.stringify({ tenantId: "test" }),
    headers: {
      Authorization: "Bearer invalid-token",
      "Content-Type": "application/json",
    },
  });
  const body = await res.json();
  assertEquals(res.status, 400);
  assertExists(body.error);
});
