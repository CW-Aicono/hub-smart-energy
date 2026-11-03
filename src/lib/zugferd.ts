// ZUGFeRD 2.x / Factur-X, Profil EN 16931 (COMFORT): maschinenlesbare Rechnungsdaten (CII-XML),
// die als "factur-x.xml" in das Rechnungs-PDF eingebettet werden.
import { PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";

export interface EParty {
  name: string;
  street?: string | null; postalCode?: string | null; city?: string | null; country?: string | null;
  vatId?: string | null; taxNumber?: string | null; email?: string | null;
}
export interface ELine { label: string; quantity: number; unitPrice: number; amount: number }
export interface EInvoiceInput {
  number: string;
  /** 380 Rechnung, 381 Gutschrift/Storno (Korrektur), 389 Gutschrift im Gutschriftverfahren (Provision) */
  typeCode: "380" | "381" | "389";
  issueDate: string; dueDate?: string | null; periodStart?: string | null; periodEnd?: string | null;
  seller: EParty; buyer: EParty;
  buyerReference?: string | null; // Leitweg-ID
  precedingNumber?: string | null; // Bezug bei Storno
  lines: ELine[]; vatRate: number;
  iban?: string | null; bic?: string | null; paymentTerms?: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => r2(n).toFixed(2);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const d102 = (s: string) => s.slice(0, 10).replace(/-/g, "");
const COUNTRY: Record<string, string> = { deutschland: "DE", germany: "DE", österreich: "AT", austria: "AT", schweiz: "CH", niederlande: "NL", netherlands: "NL", spanien: "ES", spain: "ES" };
const iso = (c?: string | null) => { const v = (c ?? "").trim(); if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase(); return COUNTRY[v.toLowerCase()] ?? "DE"; };

/** Summen nach EN 16931: Positionssumme, USt, Brutto (kaufmännisch gerundet). */
export function eInvoiceTotals(lines: ELine[], vatRate: number) {
  const net = r2(lines.reduce((s, l) => s + r2(l.amount), 0));
  const vat = r2(net * vatRate / 100);
  return { net, vat, gross: r2(net + vat) };
}

function party(tag: string, p: EParty) {
  const reg = [p.vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(p.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : "",
    p.taxNumber ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(p.taxNumber)}</ram:ID></ram:SpecifiedTaxRegistration>` : ""].join("");
  return `<ram:${tag}><ram:Name>${esc(p.name)}</ram:Name><ram:PostalTradeAddress>${p.postalCode ? `<ram:PostcodeCode>${esc(p.postalCode)}</ram:PostcodeCode>` : ""}${p.street ? `<ram:LineOne>${esc(p.street)}</ram:LineOne>` : ""}${p.city ? `<ram:CityName>${esc(p.city)}</ram:CityName>` : ""}<ram:CountryID>${iso(p.country)}</ram:CountryID></ram:PostalTradeAddress>${p.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(p.email)}</ram:URIID></ram:URIUniversalCommunication>` : ""}${reg}</ram:${tag}>`;
}

/** Erzeugt das CII-XML. Storno-Rechnungen (negative Beträge) werden als Typ 381 mit positiven Beträgen ausgewiesen. */
export function buildZugferdXml(inv: EInvoiceInput): string {
  const negative = inv.lines.reduce((s, l) => s + l.amount, 0) < 0;
  const sign = negative ? -1 : 1;
  const typeCode = negative && inv.typeCode === "380" ? "381" : inv.typeCode;
  const lines = inv.lines.map((l) => ({ ...l, amount: r2(l.amount * sign) }));
  const t = eInvoiceTotals(lines, inv.vatRate);
  const cat = inv.vatRate > 0 ? "S" : "Z";
  const items = lines.map((l, i) => {
    // Preise dürfen nicht negativ sein: Abzüge (z. B. Rabatt) als negative Menge ausweisen
    const qty = Math.abs(l.quantity || 1) * (l.amount < 0 ? -1 : 1);
    const price = Math.abs(l.unitPrice) || (qty ? Math.abs(l.amount / qty) : 0);
    return `<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument><ram:SpecifiedTradeProduct><ram:Name>${esc(l.label)}</ram:Name></ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${price.toFixed(4)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${qty.toFixed(4)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${cat}</ram:CategoryCode><ram:RateApplicablePercent>${inv.vatRate.toFixed(2)}</ram:RateApplicablePercent></ram:ApplicableTradeTax><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${money(l.amount)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`;
  }).join("");
  const period = inv.periodStart && inv.periodEnd ? `<ram:BillingSpecifiedPeriod><ram:StartDateTime><udt:DateTimeString format="102">${d102(inv.periodStart)}</udt:DateTimeString></ram:StartDateTime><ram:EndDateTime><udt:DateTimeString format="102">${d102(inv.periodEnd)}</udt:DateTimeString></ram:EndDateTime></ram:BillingSpecifiedPeriod>` : "";
  const means = inv.iban ? `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(inv.iban.replace(/\s/g, ""))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>${inv.bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${esc(inv.bic)}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>` : ""}</ram:SpecifiedTradeSettlementPaymentMeans>` : "";
  const terms = inv.dueDate || inv.paymentTerms ? `<ram:SpecifiedTradePaymentTerms>${inv.paymentTerms ? `<ram:Description>${esc(inv.paymentTerms)}</ram:Description>` : ""}${inv.dueDate ? `<ram:DueDateDateTime><udt:DateTimeString format="102">${d102(inv.dueDate)}</udt:DateTimeString></ram:DueDateDateTime>` : ""}</ram:SpecifiedTradePaymentTerms>` : "";
  const preceding = inv.precedingNumber ? `<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${esc(inv.precedingNumber)}</ram:IssuerAssignedID></ram:InvoiceReferencedDocument>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"><rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext><rsm:ExchangedDocument><ram:ID>${esc(inv.number)}</ram:ID><ram:TypeCode>${typeCode}</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">${d102(inv.issueDate)}</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument><rsm:SupplyChainTradeTransaction>${items}<ram:ApplicableHeaderTradeAgreement>${inv.buyerReference ? `<ram:BuyerReference>${esc(inv.buyerReference)}</ram:BuyerReference>` : ""}${party("SellerTradeParty", inv.seller)}${party("BuyerTradeParty", inv.buyer)}</ram:ApplicableHeaderTradeAgreement><ram:ApplicableHeaderTradeDelivery/><ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>${means}<ram:ApplicableTradeTax><ram:CalculatedAmount>${money(t.vat)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>${money(t.net)}</ram:BasisAmount><ram:CategoryCode>${cat}</ram:CategoryCode><ram:RateApplicablePercent>${inv.vatRate.toFixed(2)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>${period}${terms}<ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>${money(t.net)}</ram:LineTotalAmount><ram:TaxBasisTotalAmount>${money(t.net)}</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">${money(t.vat)}</ram:TaxTotalAmount><ram:GrandTotalAmount>${money(t.gross)}</ram:GrandTotalAmount><ram:DuePayableAmount>${money(t.gross)}</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>${preceding}</ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>`;
}

const xmp = (title: string) => `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)}</rdf:li></rdf:Alt></dc:title></rdf:Description>
<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:Version>1.0</fx:Version><fx:ConformanceLevel>EN 16931</fx:ConformanceLevel></rdf:Description>
<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#"><pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource"><pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema><pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI><pdfaSchema:prefix>fx</pdfaSchema:prefix><pdfaSchema:property><rdf:Seq>
<rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>name of the embedded XML invoice file</pdfaProperty:description></rdf:li>
<rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>INVOICE</pdfaProperty:description></rdf:li>
<rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The actual version of the Factur-X XML schema</pdfaProperty:description></rdf:li>
<rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The conformance level of the embedded Factur-X data</pdfaProperty:description></rdf:li>
</rdf:Seq></pdfaSchema:property></rdf:li></rdf:Bag></pdfaExtension:schemas></rdf:Description>
</rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;

/** Bettet das XML als "factur-x.xml" (AFRelationship Alternative) samt Factur-X-Metadaten in das PDF ein. */
export async function embedZugferd(pdfBytes: ArrayBuffer | Uint8Array, xml: string, title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes);
  const ctx = pdf.context;
  const data = new Uint8Array(new TextEncoder().encode(xml));
  const now = new Date();
  const file = ctx.flateStream(data, { Type: "EmbeddedFile", Subtype: "text/xml", Params: { ModDate: PDFString.fromDate(now), Size: data.length } });
  const fileRef = ctx.register(file);
  const spec = ctx.obj({ Type: "Filespec", F: PDFString.of("factur-x.xml"), UF: PDFHexString.fromText("factur-x.xml"), Desc: PDFString.of("Factur-X Invoice"), AFRelationship: "Alternative", EF: { F: fileRef, UF: fileRef } });
  const specRef = ctx.register(spec);
  const catalog = pdf.catalog;
  catalog.set(PDFName.of("AF"), ctx.obj([specRef]));
  catalog.set(PDFName.of("Names"), ctx.obj({ EmbeddedFiles: { Names: [PDFHexString.fromText("factur-x.xml"), specRef] } }));
  const meta = ctx.stream(new Uint8Array(new TextEncoder().encode(xmp(title))), { Type: "Metadata", Subtype: "XML" });
  catalog.set(PDFName.of("Metadata"), ctx.register(meta));
  pdf.setTitle(title);
  pdf.setProducer("AICONO EMS");
  pdf.setModificationDate(now);
  return pdf.save({ useObjectStreams: false });
}
