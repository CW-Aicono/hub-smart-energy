import { describe, it, expect } from "vitest";
import { cn } from "../utils";

describe("cn (classname merge utility)", () => {
  it("merges multiple class strings", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("merges conflicting tailwind classes (last wins)", () => {
    expect(cn("px-4", "px-8")).toBe("px-8");
  });

  it("handles undefined and null inputs", () => {
    expect(cn("a", undefined, null, "b")).toBe("a b");
  });

  it("handles empty call", () => {
    expect(cn()).toBe("");
  });

  it("handles array inputs via clsx", () => {
    expect(cn(["a", "b"])).toBe("a b");
  });
});
