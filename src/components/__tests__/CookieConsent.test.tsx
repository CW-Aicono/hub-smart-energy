import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CookieConsent from "../CookieConsent";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderConsent() {
  return render(
    <MemoryRouter>
      <CookieConsent />
    </MemoryRouter>
  );
}

describe("CookieConsent", () => {
  it("shows banner after delay when no consent stored", async () => {
    renderConsent();
    expect(screen.queryByText("Datenschutz & Cookies")).not.toBeInTheDocument();
    vi.advanceTimersByTime(1000);
    await waitFor(() => {
      expect(screen.getByText("Datenschutz & Cookies")).toBeInTheDocument();
    });
  });

  it("does not show banner when consent already given", () => {
    localStorage.setItem("cookie_consent", "accepted");
    renderConsent();
    vi.advanceTimersByTime(1000);
    expect(screen.queryByText("Datenschutz & Cookies")).not.toBeInTheDocument();
  });

  it("hides banner on accept and stores consent", async () => {
    renderConsent();
    vi.advanceTimersByTime(1000);
    await waitFor(() => screen.getByText("Alle akzeptieren"));
    fireEvent.click(screen.getByText("Alle akzeptieren"));
    expect(localStorage.getItem("cookie_consent")).toBe("accepted");
  });

  it("hides banner on reject and stores consent", async () => {
    renderConsent();
    vi.advanceTimersByTime(1000);
    await waitFor(() => screen.getByText("Alle ablehnen"));
    fireEvent.click(screen.getByText("Alle ablehnen"));
    expect(localStorage.getItem("cookie_consent")).toBe("rejected");
  });

  it("toggles details section", async () => {
    renderConsent();
    vi.advanceTimersByTime(1000);
    await waitFor(() => screen.getByText("Details anzeigen"));
    fireEvent.click(screen.getByText("Details anzeigen"));
    expect(screen.getByText("Notwendige Cookies")).toBeInTheDocument();
    expect(screen.getByText("Analyse-Cookies")).toBeInTheDocument();
  });
});
