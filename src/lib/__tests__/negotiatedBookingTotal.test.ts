import { expect, it } from "vitest";
import { allocateBookingTotal, parseBookingTotal } from "../negotiatedBookingTotal";
it("accepts the negotiated 6.000,00 euro total directly", () => expect(parseBookingTotal("6.000,00")).toBe(6000));
it("allocates exactly 6000 euros across monitoring and analysis without rounded discount drift", () => {
  const parts = allocateBookingTotal(6000, [99 * 60, 49 * 60]);
  expect(parts).toEqual([4013.51, 1986.49]);
  expect(parts.reduce((a,b) => a+b,0)).toBe(6000);
});
it("rejects invalid price input rather than converting it to a free booking", () => expect(Number.isNaN(parseBookingTotal("invalid"))).toBe(true));