import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

describe("NotFound page", () => {
  it("renders 404 message", async () => {
    const NotFound = (await import("../NotFound")).default;
    render(<MemoryRouter><NotFound /></MemoryRouter>);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText(/Page not found/i)).toBeInTheDocument();
  });

  it("has link back to home", async () => {
    const NotFound = (await import("../NotFound")).default;
    render(<MemoryRouter><NotFound /></MemoryRouter>);
    const link = screen.getByText("Return to Home");
    expect(link).toHaveAttribute("href", "/");
  });
});
