import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  downloadCSV,
  buildStackedBarChartSVG,
  buildTrendLineSVG,
  buildTrafficLightSVG,
} from "../exportUtils";

describe("downloadCSV", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing for empty data", () => {
    const spy = vi.spyOn(document, "createElement");
    downloadCSV([], "test");
    expect(spy).not.toHaveBeenCalled();
  });

  it("creates a CSV blob with BOM and semicolons", () => {
    const revokeUrl = vi.fn();
    const createUrl = vi.fn().mockReturnValue("blob:test");
    vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: revokeUrl });

    const clickSpy = vi.fn();
    vi.spyOn(document, "createElement").mockReturnValue({
      set href(_: string) {},
      set download(_: string) {},
      click: clickSpy,
    } as unknown as HTMLElement);

    downloadCSV(
      [{ name: "A", value: 10 }, { name: "B", value: 20 }],
      "export"
    );

    expect(createUrl).toHaveBeenCalledTimes(1);
    const blob: Blob = createUrl.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith("blob:test");
  });

  it("uses custom headers when provided", () => {
    const createUrl = vi.fn().mockReturnValue("blob:test");
    vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: vi.fn() });
    vi.spyOn(document, "createElement").mockReturnValue({
      set href(_: string) {},
      set download(_: string) {},
      click: vi.fn(),
    } as unknown as HTMLElement);

    downloadCSV(
      [{ n: "X", v: 5 }],
      "test",
      { n: "Name", v: "Wert" }
    );

    expect(createUrl).toHaveBeenCalledTimes(1);
  });

  it("escapes values with semicolons and quotes", () => {
    const createUrl = vi.fn().mockReturnValue("blob:test");
    vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: vi.fn() });
    vi.spyOn(document, "createElement").mockReturnValue({
      set href(_: string) {},
      set download(_: string) {},
      click: vi.fn(),
    } as unknown as HTMLElement);

    downloadCSV([{ text: 'has;semi' }, { text: 'has"quote' }], "test");

    const blob: Blob = createUrl.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
  });
});

describe("buildStackedBarChartSVG", () => {
  it("returns empty string for empty data", () => {
    expect(buildStackedBarChartSVG([])).toBe("");
  });

  it("returns SVG with bars for valid data", () => {
    const svg = buildStackedBarChartSVG([
      { label: "Loc1", values: [{ type: "Strom", value: 100, color: "#eab308" }] },
      { label: "Loc2", values: [{ type: "Gas", value: 50, color: "#f97316" }] },
    ]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Loc1");
    expect(svg).toContain("</svg>");
  });
});

describe("buildTrendLineSVG", () => {
  it("returns empty string for less than 2 data points", () => {
    expect(buildTrendLineSVG([])).toBe("");
    expect(buildTrendLineSVG([{ year: 2024, value: 100 }])).toBe("");
  });

  it("returns SVG polyline for valid data", () => {
    const svg = buildTrendLineSVG([
      { year: 2022, value: 80 },
      { year: 2023, value: 100 },
      { year: 2024, value: 90 },
    ]);
    expect(svg).toContain("<polyline");
    expect(svg).toContain("2022");
    expect(svg).toContain("2024");
  });

  it("uses custom color", () => {
    const svg = buildTrendLineSVG(
      [{ year: 2023, value: 10 }, { year: 2024, value: 20 }],
      "#ff0000"
    );
    expect(svg).toContain("#ff0000");
  });
});

describe("buildTrafficLightSVG", () => {
  it("renders green traffic light", () => {
    const svg = buildTrafficLightSVG("green", "42 kWh/m²");
    expect(svg).toContain("#10b981");
    expect(svg).toContain("42 kWh/m²");
    expect(svg).toContain("Gut");
  });

  it("renders yellow traffic light", () => {
    const svg = buildTrafficLightSVG("yellow", "80 kWh/m²");
    expect(svg).toContain("#f59e0b");
    expect(svg).toContain("Mittel");
  });

  it("renders red traffic light", () => {
    const svg = buildTrafficLightSVG("red", "150 kWh/m²");
    expect(svg).toContain("#ef4444");
    expect(svg).toContain("Hoch");
  });
});
