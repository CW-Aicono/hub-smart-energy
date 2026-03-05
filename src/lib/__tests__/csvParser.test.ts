import { describe, it, expect } from "vitest";
import {
  parseCSVText,
  autoDetectMapping,
  parseGermanNumber,
  parseFlexibleDate,
  generateReadingsTemplate,
  generateConsumptionTemplate,
} from "../csvParser";

describe("parseCSVText", () => {
  it("parses semicolon-separated CSV", () => {
    const result = parseCSVText("Name;Wert\nTest;123");
    expect(result.headers).toEqual(["Name", "Wert"]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ Name: "Test", Wert: "123" });
  });

  it("parses comma-separated CSV", () => {
    const result = parseCSVText("Name,Value\nA,1\nB,2");
    expect(result.headers).toEqual(["Name", "Value"]);
    expect(result.rows).toHaveLength(2);
  });

  it("handles BOM", () => {
    const result = parseCSVText("\uFEFFName;Wert\nTest;42");
    expect(result.headers).toEqual(["Name", "Wert"]);
  });

  it("handles quoted fields with semicolons", () => {
    const result = parseCSVText('Name;Wert\n"Tes;t";123');
    expect(result.rows[0].Name).toBe("Tes;t");
  });

  it("handles escaped quotes", () => {
    const result = parseCSVText('Name;Wert\n"Te""st";123');
    expect(result.rows[0].Name).toBe('Te"st');
  });

  it("returns empty for empty input", () => {
    const result = parseCSVText("");
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("skips empty lines", () => {
    const result = parseCSVText("A;B\n1;2\n\n3;4\n");
    expect(result.rows).toHaveLength(2);
  });
});

describe("autoDetectMapping", () => {
  it("detects standard German headers", () => {
    const mapping = autoDetectMapping(["Zählernummer", "Datum", "Wert", "Notiz"]);
    expect(mapping["Zählernummer"]).toBe("meter_number");
    expect(mapping["Datum"]).toBe("date");
    expect(mapping["Wert"]).toBe("value");
    expect(mapping["Notiz"]).toBe("notes");
  });

  it("detects English headers", () => {
    const mapping = autoDetectMapping(["MeterNumber", "Date", "Value"]);
    expect(mapping["MeterNumber"]).toBe("meter_number");
    expect(mapping["Date"]).toBe("date");
    expect(mapping["Value"]).toBe("value");
  });

  it("marks unknown headers as none", () => {
    const mapping = autoDetectMapping(["Foo", "Bar"]);
    expect(mapping["Foo"]).toBe("none");
    expect(mapping["Bar"]).toBe("none");
  });
});

describe("parseGermanNumber", () => {
  it("parses German format (1.234,56)", () => {
    expect(parseGermanNumber("1.234,56")).toBeCloseTo(1234.56);
  });

  it("parses comma-only (1234,56)", () => {
    expect(parseGermanNumber("1234,56")).toBeCloseTo(1234.56);
  });

  it("parses plain number", () => {
    expect(parseGermanNumber("1234.56")).toBeCloseTo(1234.56);
  });

  it("returns null for empty string", () => {
    expect(parseGermanNumber("")).toBeNull();
  });

  it("returns null for non-numeric", () => {
    expect(parseGermanNumber("abc")).toBeNull();
  });

  it("trims whitespace", () => {
    expect(parseGermanNumber("  42  ")).toBe(42);
  });
});

describe("parseFlexibleDate", () => {
  it("parses DD.MM.YYYY", () => {
    expect(parseFlexibleDate("15.03.2024")).toBe("2024-03-15");
  });

  it("parses MM/YYYY to first of month", () => {
    expect(parseFlexibleDate("03/2024")).toBe("2024-03-01");
  });

  it("parses ISO format", () => {
    expect(parseFlexibleDate("2024-03-15")).toBe("2024-03-15");
  });

  it("parses single-digit day/month", () => {
    expect(parseFlexibleDate("1.3.2024")).toBe("2024-03-01");
  });

  it("returns null for invalid date", () => {
    expect(parseFlexibleDate("invalid")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseFlexibleDate("")).toBeNull();
  });
});

describe("template generators", () => {
  it("generates readings template with headers", () => {
    const csv = generateReadingsTemplate();
    expect(csv).toContain("Zählernummer");
    expect(csv).toContain("Datum");
  });

  it("generates consumption template with headers", () => {
    const csv = generateConsumptionTemplate();
    expect(csv).toContain("Verbrauch");
    expect(csv).toContain("Zeitraum");
  });
});
