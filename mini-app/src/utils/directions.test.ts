import { describe, expect, it } from "vitest";
import { directionsUrl } from "./directions";

describe("directionsUrl — nút Chỉ đường", () => {
  it("có link Google Maps của quán → dùng đúng link đó", () => {
    expect(directionsUrl("https://maps.app.goo.gl/abc", "236 Bảo Lương")).toBe("https://maps.app.goo.gl/abc");
  });
  it("chưa cấu hình link → tìm theo địa chỉ trên Google Maps", () => {
    expect(directionsUrl(null, "236 Bảo Lương, Lào Cai")).toBe(
      "https://www.google.com/maps/search/?api=1&query=236%20B%E1%BA%A3o%20L%C6%B0%C6%A1ng%2C%20L%C3%A0o%20Cai",
    );
  });
  it("link lạ (không https) bị bỏ qua, rơi về tìm theo địa chỉ", () => {
    expect(directionsUrl("javascript:alert(1)", "Lào Cai")).toBe("https://www.google.com/maps/search/?api=1&query=L%C3%A0o%20Cai");
  });
  it("không link, không địa chỉ → ẩn nút (null)", () => {
    expect(directionsUrl("", "  ")).toBeNull();
  });
});
