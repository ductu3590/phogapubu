import { describe, expect, it } from "vitest";
import { menuBadge } from "./menu-badge";

describe("nhãn món trên Mini App (PA-4)", () => {
  it("2 nhãn có nhãn chữ tiếng Việt", () => {
    expect(menuBadge("best_seller")).toEqual({ key: "best_seller", label: "Best seller" });
    expect(menuBadge("signature")).toEqual({ key: "signature", label: "Món của quán" });
  });
  it("null / rỗng / giá trị lạ → không hiện", () => {
    expect(menuBadge(null)).toBeNull();
    expect(menuBadge("")).toBeNull();
    expect(menuBadge("hot")).toBeNull();
  });
});
