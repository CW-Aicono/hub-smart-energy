import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { safeAuthRedirect } from "./appOrigin.ts";

Deno.test("preview address is replaced by allowed origin", () => {
  assertEquals(
    safeAuthRedirect("https://id-preview--x.lovable.app/set-password", null, "https://staging.aicono.org"),
    "https://staging.aicono.org/set-password",
  );
});
Deno.test("foreign address falls back to live domain", () => {
  assertEquals(safeAuthRedirect("https://evil.example/set-password", null, null), "https://ems-pro.aicono.org/set-password");
});
Deno.test("allowed origin and sharing path are kept", () => {
  assertEquals(
    safeAuthRedirect("https://staging.aicono.org/mein-sharing/set-password", null, null),
    "https://staging.aicono.org/mein-sharing/set-password",
  );
});
