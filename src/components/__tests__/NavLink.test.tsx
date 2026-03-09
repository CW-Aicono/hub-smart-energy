import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NavLink } from "../NavLink";

describe("NavLink", () => {
  it("renders a link with the correct text", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <NavLink to="/test">Test Link</NavLink>
      </MemoryRouter>
    );
    expect(screen.getByText("Test Link")).toBeInTheDocument();
  });

  it("applies activeClassName when route matches", () => {
    render(
      <MemoryRouter initialEntries={["/active"]}>
        <NavLink to="/active" className="base" activeClassName="is-active">
          Active
        </NavLink>
      </MemoryRouter>
    );
    const link = screen.getByText("Active");
    expect(link.className).toContain("is-active");
  });

  it("does not apply activeClassName when route does not match", () => {
    render(
      <MemoryRouter initialEntries={["/other"]}>
        <NavLink to="/active" className="base" activeClassName="is-active">
          Inactive
        </NavLink>
      </MemoryRouter>
    );
    const link = screen.getByText("Inactive");
    expect(link.className).not.toContain("is-active");
  });
});
