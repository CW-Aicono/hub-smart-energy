import { describe, it, expect } from "vitest";
import { validatePassword, passwordErrorMessage } from "../passwordPolicy";

describe("passwordPolicy", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(validatePassword("abc1234", "abc1234")).toMatch(/8 Zeichen/);
  });
  it("requires a letter and a digit", () => {
    expect(validatePassword("abcdefgh", "abcdefgh")).toMatch(/Ziffer/);
    expect(validatePassword("12345678", "12345678")).toMatch(/Buchstaben/);
  });
  it("rejects new password equal to current", () => {
    expect(validatePassword("Sicher123", "Sicher123", "Sicher123")).toMatch(/unterscheiden/);
  });
  it("rejects mismatched confirmation", () => {
    expect(validatePassword("Sicher123", "Sicher124")).toMatch(/stimmen nicht/);
  });
  it("accepts a valid password", () => {
    expect(validatePassword("Sicher123", "Sicher123", "Alt12345")).toBeNull();
  });
  it("maps leaked-password error to German text", () => {
    expect(passwordErrorMessage({ code: "weak_password" })).toMatch(/Datenlecks/);
  });
});
