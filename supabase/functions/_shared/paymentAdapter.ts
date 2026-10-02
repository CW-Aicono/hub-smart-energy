// Shared payment adapter interface + Mock implementation.
// CCV / Nayax / Payter etc. will implement this same interface after PSP onboarding.

export interface PreauthRequest {
  session_id: string;
  amount_cents: number;
  currency: string;
  terminal_serial?: string;
}

export interface PreauthResult {
  ok: boolean;
  psp_reference?: string;
  card_brand?: string;
  card_last4?: string;
  error?: string;
}

export interface CaptureRequest {
  session_id: string;
  psp_reference: string;
  amount_cents: number;
  currency: string;
}

export interface CaptureResult {
  ok: boolean;
  psp_reference?: string;
  error?: string;
}

export interface RefundRequest {
  session_id: string;
  psp_reference: string;
  amount_cents: number;
  currency: string;
}

export interface RefundResult {
  ok: boolean;
  psp_reference?: string;
  error?: string;
}

export interface PaymentAdapter {
  readonly kind: string;
  preauth(req: PreauthRequest): Promise<PreauthResult>;
  capture(req: CaptureRequest): Promise<CaptureResult>;
  cancel(req: { session_id: string; psp_reference: string }): Promise<{ ok: boolean; error?: string }>;
  refund(req: RefundRequest): Promise<RefundResult>;
}

// ---------------- Mock ----------------
const CARD_BRANDS = ["visa", "mastercard", "amex", "girocard"];

export class MockAdapter implements PaymentAdapter {
  readonly kind = "mock";
  async preauth(req: PreauthRequest): Promise<PreauthResult> {
    return {
      ok: true,
      psp_reference: `MOCK-P-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      card_brand: CARD_BRANDS[Math.floor(Math.random() * CARD_BRANDS.length)],
      card_last4: String(Math.floor(1000 + Math.random() * 9000)),
    };
  }
  async capture(req: CaptureRequest): Promise<CaptureResult> {
    return { ok: true, psp_reference: `MOCK-C-${crypto.randomUUID().slice(0, 8).toUpperCase()}` };
  }
  async cancel(): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  }
  async refund(req: RefundRequest): Promise<RefundResult> {
    return { ok: true, psp_reference: `MOCK-R-${crypto.randomUUID().slice(0, 8).toUpperCase()}` };
  }
}

// ---------------- Stub CCV (to be implemented after sandbox onboarding) ----------------
export class CcvAdapterStub implements PaymentAdapter {
  readonly kind = "ccv";
  private notReady(): never { throw new Error("CCV-Adapter noch nicht aktiviert (Sandbox-Zugang ausstehend)"); }
  async preauth(): Promise<PreauthResult> { this.notReady(); }
  async capture(): Promise<CaptureResult> { this.notReady(); }
  async cancel() { this.notReady(); }
  async refund(): Promise<RefundResult> { this.notReady(); }
}

export function getAdapterFor(providerType: string): PaymentAdapter {
  switch (providerType) {
    case "ccv": return new CcvAdapterStub();
    // "nayax", "payter", "adyen" → will follow the same pattern
    default: return new MockAdapter();
  }
}
