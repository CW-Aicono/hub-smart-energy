import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CookieConsent from "../CookieConsent";

beforeEach(() => {
  localStorage.clear();
});

function renderConsent() {
  return render(
    <MemoryRouter>
      <CookieConsent />
    </MemoryRouter>
  );
}

describe("CookieConsent", () => {
  it("does not show banner when consent already given", () => {
    localStorage.setItem("cookie_consent", "accepted");
    renderConsent();
    expect(screen.queryByText("Datenschutz & Cookies")).not.toBeInTheDocument();
  });

  it("shows banner after delay when no consent stored", async () => {
    vi.useFakeTimers();
    renderConsent();
    expect(screen.queryByText("Datenschutz & Cookies")).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Datenschutz & Cookies")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("hides banner on accept and stores consent", async () => {
    vi.useFakeTimers();
    renderConsent();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByText("Alle akzeptieren"));
    expect(localStorage.getItem("cookie_consent")).toBe("accepted");
    vi.useRealTimers();
  });

  it("hides banner on reject and stores consent", async () => {
    vi.useFakeTimers();
    renderConsent();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByText("Alle ablehnen"));
    expect(localStorage.getItem("cookie_consent")).toBe("rejected");
    vi.useRealTimers();
  });

  it("toggles details section", async () => {
    vi.useFakeTimers();
    renderConsent();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByText("Details anzeigen"));
    expect(screen.getByText("Notwendige Cookies")).toBeInTheDocument();
    expect(screen.getByText("Analyse-Cookies")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
