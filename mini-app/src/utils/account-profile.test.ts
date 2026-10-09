import { describe, expect, it } from "vitest";
import { formatPhoneDisplay, mergeProfile, prefillContact } from "./account-profile";

describe("mergeProfile", () => {
  it("hồ sơ trống: nhận tên Zalo và chuẩn hoá SĐT 84… về 0…", () => {
    expect(mergeProfile(null, { customerName: " An ", customerPhone: "84912345678" }, { overwriteName: false }))
      .toEqual({ customerName: "An", customerPhone: "0912345678" });
  });

  it("overwriteName=false: KHÔNG đè tên khách đã tự sửa", () => {
    const current = { customerName: "Anh Nam bàn 5", customerPhone: "" };
    expect(mergeProfile(current, { customerName: "Nguyễn Văn Nam" }, { overwriteName: false }).customerName).toBe("Anh Nam bàn 5");
  });

  it("overwriteName=true: đè tên, kể cả xoá trống", () => {
    const current = { customerName: "Cũ", customerPhone: "0912345678" };
    expect(mergeProfile(current, { customerName: "Mới" }, { overwriteName: true }).customerName).toBe("Mới");
    expect(mergeProfile(current, { customerName: "  " }, { overwriteName: true }).customerName).toBe("");
  });

  it("SĐT không hợp lệ: giữ số cũ", () => {
    const current = { customerName: "", customerPhone: "0912345678" };
    expect(mergeProfile(current, { customerPhone: "12345" }, { overwriteName: false }).customerPhone).toBe("0912345678");
  });

  it("patch không có SĐT: giữ SĐT cũ", () => {
    const current = { customerName: "A", customerPhone: "0912345678" };
    expect(mergeProfile(current, { customerName: "B" }, { overwriteName: true }).customerPhone).toBe("0912345678");
  });
});

describe("prefillContact", () => {
  const profile = { customerName: "An", customerPhone: "0912345678" };

  it("ô trống thì điền từ hồ sơ", () => {
    expect(prefillContact({ customerName: "", customerPhone: "", deliveryAddress: "x" }, profile))
      .toEqual({ customerName: "An", customerPhone: "0912345678", deliveryAddress: "x" });
  });

  it("KHÔNG đè dữ liệu khách đã gõ", () => {
    expect(prefillContact({ customerName: "Bình", customerPhone: "0987654321" }, profile))
      .toEqual({ customerName: "Bình", customerPhone: "0987654321" });
  });

  it("không có hồ sơ: trả nguyên form", () => {
    const form = { customerName: "", customerPhone: "" };
    expect(prefillContact(form, null)).toBe(form);
  });
});

describe("formatPhoneDisplay", () => {
  it("nhóm 4-3-3 cho số 10 chữ số", () => expect(formatPhoneDisplay("0912345678")).toBe("0912 345 678"));
  it("chuỗi lạ trả nguyên", () => expect(formatPhoneDisplay("abc")).toBe("abc"));
});
