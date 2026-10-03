import { describe, expect, it } from "vitest";
import { DEFAULT_PRIMARY, applyPrimaryColor, hexToRgbChannels } from "./theme-color";

function fakeRoot() {
  const props = new Map<string, string>();
  return {
    props,
    el: { style: { setProperty: (k: string, v: string) => props.set(k, v) } } as unknown as HTMLElement,
  };
}

describe("hexToRgbChannels", () => {
  it("đổi hex 6 và 3 ký tự sang kênh rgb cho Tailwind", () => {
    expect(hexToRgbChannels("#C0341A")).toBe("192 52 26");
    expect(hexToRgbChannels("c34")).toBe("204 51 68");
  });

  it("mã sai định dạng → null", () => {
    expect(hexToRgbChannels("red")).toBeNull();
    expect(hexToRgbChannels("#12345")).toBeNull();
  });
});

describe("applyPrimaryColor", () => {
  it("đặt cả --color-primary lẫn --color-primary-rgb theo màu quán", () => {
    const { props, el } = fakeRoot();
    applyPrimaryColor("#C0341A", el);
    expect(props.get("--color-primary")).toBe("#C0341A");
    expect(props.get("--color-primary-rgb")).toBe("192 52 26");
  });

  it("màu rỗng hoặc hỏng thì dùng màu mặc định, không để nút mất màu", () => {
    for (const bad of [null, "", "not-a-color"]) {
      const { props, el } = fakeRoot();
      applyPrimaryColor(bad, el);
      expect(props.get("--color-primary")).toBe(DEFAULT_PRIMARY);
      expect(props.get("--color-primary-rgb")).toBe(hexToRgbChannels(DEFAULT_PRIMARY));
    }
  });
});
