import { describe, expect, it } from "vitest";

import { t } from "./index";

describe("t", () => {
  it("returns the string of a key", () => {
    expect(t("appName")).toBe("Writeopia");
  });

  it("fills the parameters", () => {
    expect(t("version", { version: "1.2.3" })).toBe("Version 1.2.3");
  });

  it("leaves a placeholder without a parameter as it is", () => {
    expect(t("version", {})).toBe("Version {version}");
  });
});
