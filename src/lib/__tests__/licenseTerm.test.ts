import { describe, it, expect } from "vitest";
import { termEnd } from "../licenseTerm";
describe("termEnd", () => {
  it("12 Monate ab 01.11.2026 enden am 31.10.2027", () => expect(termEnd("2026-11-01", 12)).toBe("2027-10-31"));
  it("1 Monat ab 31.01.2027 endet am 27.02.2027 (wie Postgres-Intervall)", () => expect(termEnd("2027-01-31", 1)).toBe("2027-02-27"));
  it("24 Monate ab 15.03.2026 enden am 14.03.2028", () => expect(termEnd("2026-03-15", 24)).toBe("2028-03-14"));
});
