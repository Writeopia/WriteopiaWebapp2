import { describe, expect, it } from "vitest";

import { isValidUsername, validatePassword } from "./password";

describe("validatePassword", () => {
  it("has no strength for an empty password", () => {
    expect(validatePassword("")).toEqual({
      strength: "none",
      hasMinLength: false,
      hasSpecialChar: false,
    });
  });

  it("is weak with neither rule, medium with one, strong with both", () => {
    expect(validatePassword("abc").strength).toBe("weak");
    expect(validatePassword("abcdefgh").strength).toBe("medium");
    expect(validatePassword("abc!").strength).toBe("medium");
    expect(validatePassword("abcdefg!").strength).toBe("strong");
  });

  it("knows the special characters of the other apps", () => {
    for (const char of "!@#$%^&*()_+-=[]{}|;':\",./<>?`~\\") {
      expect(validatePassword(`a${char}`).hasSpecialChar, char).toBe(true);
    }
    expect(validatePassword("abc 123").hasSpecialChar).toBe(false);
  });
});

describe("isValidUsername", () => {
  it("takes 3 to 30 letters, digits, dashes and underscores", () => {
    expect(isValidUsername("ana")).toBe(true);
    expect(isValidUsername("ana_maria-2")).toBe(true);
    expect(isValidUsername("joão")).toBe(true);
    expect(isValidUsername("a".repeat(30))).toBe(true);
  });

  it("refuses the rest", () => {
    expect(isValidUsername("an")).toBe(false);
    expect(isValidUsername("a".repeat(31))).toBe(false);
    expect(isValidUsername("ana maria")).toBe(false);
    expect(isValidUsername("ana@writeopia")).toBe(false);
    expect(isValidUsername("")).toBe(false);
  });
});
