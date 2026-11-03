import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invoicePreviewParties } from "../invoicePreview";

const db = new PGlite();
const partner = "10000000-0000-4000-8000-000000000001";
beforeAll(async () => {
  await db.exec(`
    CREATE TABLE partners(id uuid PRIMARY KEY,logo_url text,primary_color text,secondary_color text,accent_color text);
    CREATE TABLE partner_billing_settings(partner_id uuid,settings jsonb);
    CREATE TABLE partner_customer_invoices(id uuid PRIMARY KEY,partner_id uuid,sender_snapshot jsonb,issued_at timestamptz);
    INSERT INTO partners VALUES('${partner}','https://example.org/original.png','#123456','#ffe401','#abcdef');
    INSERT INTO partner_billing_settings VALUES('${partner}','{"company_name":"Partner","vat_rate":19,"payment_terms_days":14,"iban":"original"}');
    INSERT INTO partner_customer_invoices VALUES('${partner}','${partner}',NULL,NULL);
    CREATE FUNCTION issue_partner_customer_invoice(p_invoice uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE i partner_customer_invoices; s jsonb;
    BEGIN
      SELECT * INTO i FROM partner_customer_invoices WHERE id=p_invoice;
      IF i.issued_at IS NOT NULL THEN RETURN i.sender_snapshot; END IF;
      SELECT settings INTO s FROM partner_billing_settings WHERE partner_id=i.partner_id;
      UPDATE partner_customer_invoices SET sender_snapshot=s,issued_at=now() WHERE id=p_invoice;
      RETURN s;
    END $$;
  `);
  const migration = readFileSync("drizzle/migrations/0080_partner_invoice_branding_snapshot.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration);
}, 30000);
afterAll(async () => { await db.close(); });
describe("partner invoice branding", () => {
  it("freezes partner logo and all configured colors while preserving sender and payment settings", async () => {
    const result = await db.query<{ settings: Record<string, unknown> }>("SELECT issue_partner_customer_invoice($1) AS settings", [partner]);
    expect(result.rows[0].settings).toEqual({ company_name: "Partner", vat_rate: 19, payment_terms_days: 14, iban: "original", logo_url: "https://example.org/original.png", primary_color: "#123456", secondary_color: "#ffe401", accent_color: "#abcdef" });
  });
  it("does not rebrand an issued invoice when partner settings later change", async () => {
    await db.exec("UPDATE partners SET logo_url='https://example.org/new.png',primary_color='#ffffff',secondary_color=NULL,accent_color=NULL");
    const result = await db.query<{ settings: Record<string, unknown> }>("SELECT issue_partner_customer_invoice($1) AS settings", [partner]);
    expect(result.rows[0].settings.logo_url).toBe("https://example.org/original.png");
    expect(result.rows[0].settings.primary_color).toBe("#123456");
  });
  it("draft previews use current branding without issuing or changing the document", () => {
    const invoice = { issued_at: null, sender_snapshot: { company_name: "Old", logo_url: "old" } };
    const current = { company_name: "Partner", logo_url: "current", secondary_color: "#ffe401" };
    expect(invoicePreviewParties(invoice, current, { name: "Tenant" }).settings).toEqual(current);
    expect(invoice).toEqual({ issued_at: null, sender_snapshot: { company_name: "Old", logo_url: "old" } });
  });
});