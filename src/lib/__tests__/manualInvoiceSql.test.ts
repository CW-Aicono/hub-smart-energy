import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { manualInvoiceQuote, type ManualInvoiceOptions } from "../manualInvoiceQuote";
const db = new PGlite();
const tenant = "10000000-0000-4000-8000-000000000001";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
    CREATE TABLE access(allowed boolean); INSERT INTO access VALUES(true);
    CREATE FUNCTION public.can_portal_write(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT allowed FROM access $$;
    CREATE TABLE tenants(id uuid, partner_id uuid, deleted_at timestamptz); INSERT INTO tenants VALUES('${tenant}',null,null);
    CREATE TABLE tenant_invoices(id uuid,tenant_id uuid,partner_id uuid,invoice_kind text,source_ref text,invoice_number text,document_type text,status text,period_start date,period_end date,amount numeric,module_total numeric,support_total numeric,line_items jsonb);`);
  const migration = readFileSync("drizzle/migrations/0088_manual_invoice_booking_options.sql", "utf8");
  await db.exec(migration); await db.exec(migration);
}, 30000);
afterAll(async () => db.close());
const o: ManualInvoiceOptions = { cadence: "once", termMonths: "12", discountMode: "percent", discountValue: "0", limited: false, discountFrom: "2027-01-01", discountTo: "2027-03-31", after: "continue", payment: "invoice", from: "2027-01-01", to: "2027-01-01" };
async function create(options = o, quantity = "1", price = "49", monthly = true) {
  const q = manualInvoiceQuote([{ label: "Analyse", quantity, unit_price: price, monthly }], options);
  if (!q.success) throw new Error("invalid quote");
  const payload = { from: options.from, to: options.to, cadence: options.cadence, term_months: options.termMonths || null, limited: options.limited, discount_from: options.discountFrom, discount_to: options.discountTo, after: options.after, payment: options.payment };
  const created = await db.query<{ id: string }>("SELECT create_quoted_manual_invoice($1,null,$2::jsonb,$3::jsonb) id", [tenant, JSON.stringify(q.lines), JSON.stringify(payload)]);
  const inv = await db.query<{ amount: string; document_type: string; line_items: any[]; period_end: string }>("SELECT amount,document_type,line_items,period_end::text FROM tenant_invoices WHERE id=$1", [created.rows[0].id]);
  return { quote: q, invoice: inv.rows[0] };
}
describe("manual invoice server calculation", () => {
  it("12 months × 49 € = 588 € stored as one draft", async () => { const r = await create(); expect(Number(r.invoice.amount)).toBe(588); expect(r.invoice.period_end).toBe("2027-12-31"); expect(r.invoice.line_items).toHaveLength(1); });
  it("100 percent produces a non-bookable zero notice", async () => { const r = await create({ ...o, discountValue: "100" }); expect(Number(r.invoice.amount)).toBe(0); expect(r.invoice.document_type).toBe("subscription_notice"); });
  it("quarterly advance amount equals preview", async () => { const r = await create({ ...o, cadence: "quarterly" }); expect(Number(r.invoice.amount)).toBe(147); expect(r.invoice.period_end).toBe("2027-03-31"); });
  it("temporary reduction and restored price match preview", async () => { const r = await create({ ...o, discountValue: "50", limited: true }); expect(Number(r.invoice.amount)).toBe(514.5); expect(Number(r.invoice.amount)).toBe(r.quote.net); });
  it("euro discounts apply to quantities", async () => { const r = await create({ ...o, discountMode: "absolute", discountValue: "9" }, "2"); expect(Number(r.invoice.amount)).toBe(960); });
  it("setup stays a single 200 euro item", async () => { const r = await create(o, "1", "200", false); expect(Number(r.invoice.amount)).toBe(200); });
  it("unauthorized callers cannot create invoices", async () => { await db.exec("UPDATE access SET allowed=false"); try { await expect(create()).rejects.toThrow("Keine Berechtigung"); } finally { await db.exec("UPDATE access SET allowed=true"); } });
  it("requires duration even if a client bypasses validation", async () => { await expect(db.query("SELECT create_quoted_manual_invoice($1,null,$2::jsonb,$3::jsonb)", [tenant, JSON.stringify([{ label: "Analyse", quantity: 1, unit_price: 49, monthly: true, discount_mode: "percent", discount_value: 0 }]), JSON.stringify({ from: o.from, to: o.to, cadence: "once", payment: "invoice" })])).rejects.toThrow("Laufzeit"); });
});