/**
 * Generate a SEPA Direct Debit XML (pain.008.001.02) for batch collection.
 */

interface SepaPayment {
  /** End-to-end ID (unique per transaction) */
  endToEndId: string;
  /** Amount in EUR */
  amount: number;
  /** Mandate reference */
  mandateRef: string;
  /** Mandate sign date (YYYY-MM-DD) */
  mandateDate: string;
  /** Debtor name (account holder) */
  debtorName: string;
  /** Debtor IBAN */
  debtorIban: string;
  /** Debtor BIC (optional) */
  debtorBic?: string;
  /** Remittance info / description */
  remittanceInfo: string;
}

interface SepaDirectDebitOptions {
  /** Message ID */
  msgId: string;
  /** Creditor name */
  creditorName: string;
  /** Creditor IBAN */
  creditorIban: string;
  /** Creditor BIC */
  creditorBic: string;
  /** Creditor Identifier (Gläubiger-ID) */
  creditorId: string;
  /** Requested collection date (YYYY-MM-DD) */
  collectionDate: string;
  /** Payments */
  payments: SepaPayment[];
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtAmount(n: number): string {
  return n.toFixed(2);
}

export function generateSepaDirectDebitXml(opts: SepaDirectDebitOptions): string {
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const totalAmount = opts.payments.reduce((s, p) => s + p.amount, 0);

  const txns = opts.payments
    .map(
      (p) => `
        <DrctDbtTxInf>
          <PmtId><EndToEndId>${escXml(p.endToEndId)}</EndToEndId></PmtId>
          <InstdAmt Ccy="EUR">${fmtAmount(p.amount)}</InstdAmt>
          <DrctDbtTx>
            <MndtRltdInf>
              <MndtId>${escXml(p.mandateRef)}</MndtId>
              <DtOfSgntr>${p.mandateDate}</DtOfSgntr>
            </MndtRltdInf>
          </DrctDbtTx>
          ${p.debtorBic ? `<DbtrAgt><FinInstnId><BIC>${escXml(p.debtorBic)}</BIC></FinInstnId></DbtrAgt>` : `<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>`}
          <Dbtr><Nm>${escXml(p.debtorName)}</Nm></Dbtr>
          <DbtrAcct><Id><IBAN>${p.debtorIban.replace(/\s/g, "")}</IBAN></Id></DbtrAcct>
          <RmtInf><Ustrd>${escXml(p.remittanceInfo)}</Ustrd></RmtInf>
        </DrctDbtTxInf>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${escXml(opts.msgId)}</MsgId>
      <CreDtTm>${now}</CreDtTm>
      <NbOfTxs>${opts.payments.length}</NbOfTxs>
      <CtrlSum>${fmtAmount(totalAmount)}</CtrlSum>
      <InitgPty><Nm>${escXml(opts.creditorName)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escXml(opts.msgId + "-1")}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <NbOfTxs>${opts.payments.length}</NbOfTxs>
      <CtrlSum>${fmtAmount(totalAmount)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <LclInstrm><Cd>CORE</Cd></LclInstrm>
        <SeqTp>RCUR</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${opts.collectionDate}</ReqdColltnDt>
      <Cdtr><Nm>${escXml(opts.creditorName)}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${opts.creditorIban.replace(/\s/g, "")}</IBAN></Id></CdtrAcct>
      <CdtrAgt><FinInstnId><BIC>${escXml(opts.creditorBic)}</BIC></FinInstnId></CdtrAgt>
      <CdtrSchmeId>
        <Id><PrvtId><Othr><Id>${escXml(opts.creditorId)}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id>
      </CdtrSchmeId>
      ${txns}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`;
}

export function downloadXml(xml: string, filename: string) {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
