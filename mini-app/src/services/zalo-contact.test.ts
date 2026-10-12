import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  getSetting: vi.fn(),
  authorize: vi.fn(),
  getUserInfo: vi.fn(),
}));
vi.mock("zmp-sdk", () => sdk);

const phone = vi.hoisted(() => ({ fetchZaloPhone: vi.fn() }));
vi.mock("./zalo-phone", () => phone);

import { requestZaloContact } from "./zalo-contact";

const GRANTED = { "scope.userInfo": true, "scope.userPhonenumber": true };

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", fakeStorage());
  sdk.getSetting.mockResolvedValue({ authSetting: {} });
  sdk.authorize.mockResolvedValue({});
  sdk.getUserInfo.mockResolvedValue({ userInfo: { name: "Nguyễn Văn A", avatar: "" } });
  phone.fetchZaloPhone.mockResolvedValue({ ok: true, phone: "0912345678" });
});

describe("requestZaloContact", () => {
  it("lần đầu: xin quyền tên + SĐT, khách đồng ý → trả tên Zalo và số", async () => {
    sdk.getSetting.mockResolvedValueOnce({ authSetting: {} }).mockResolvedValueOnce({ authSetting: GRANTED });
    expect(await requestZaloContact("store-a")).toEqual({ name: "Nguyễn Văn A", phone: "0912345678" });
    expect(sdk.authorize).toHaveBeenCalledWith({ scopes: ["scope.userInfo", "scope.userPhonenumber"] });
    expect(phone.fetchZaloPhone).toHaveBeenCalledWith("store-a");
  });

  it("khách từ chối → không trả gì, không đọc tên, không lấy số", async () => {
    sdk.authorize.mockRejectedValue(new Error("-201"));
    expect(await requestZaloContact("store-a")).toEqual({});
    expect(sdk.getUserInfo).not.toHaveBeenCalled();
    expect(phone.fetchZaloPhone).not.toHaveBeenCalled();
  });

  it("chỉ hỏi MỘT lần mỗi máy: lần sau không bật hộp xin quyền nữa", async () => {
    sdk.authorize.mockRejectedValue(new Error("-201"));
    await requestZaloContact("store-a");
    await requestZaloContact("store-a");
    expect(sdk.authorize).toHaveBeenCalledTimes(1);
  });

  it("đã cấp quyền từ trước → không bật hộp, vẫn tự điền", async () => {
    sdk.getSetting.mockResolvedValue({ authSetting: GRANTED });
    expect(await requestZaloContact("store-a")).toEqual({ name: "Nguyễn Văn A", phone: "0912345678" });
    expect(sdk.authorize).not.toHaveBeenCalled();
  });

  it("chỉ cho quyền tên, từ chối SĐT → chỉ trả tên", async () => {
    sdk.getSetting
      .mockResolvedValueOnce({ authSetting: {} })
      .mockResolvedValueOnce({ authSetting: { "scope.userInfo": true, "scope.userPhonenumber": false } });
    expect(await requestZaloContact("store-a")).toEqual({ name: "Nguyễn Văn A" });
    expect(phone.fetchZaloPhone).not.toHaveBeenCalled();
  });

  it("lấy số lỗi → vẫn trả tên, bỏ số (khách nhập tay)", async () => {
    sdk.getSetting.mockResolvedValue({ authSetting: GRANTED });
    phone.fetchZaloPhone.mockResolvedValue({ ok: false, error: "zalo_error" });
    expect(await requestZaloContact("store-a")).toEqual({ name: "Nguyễn Văn A" });
  });

  it("đánh dấu đã hỏi theo từng quán", async () => {
    sdk.authorize.mockRejectedValue(new Error("-201"));
    await requestZaloContact("store-a");
    await requestZaloContact("store-b");
    expect(sdk.authorize).toHaveBeenCalledTimes(2);
  });

  it("SDK lỗi bất ngờ → trả rỗng, không ném", async () => {
    sdk.getSetting.mockRejectedValue(new Error("boom"));
    expect(await requestZaloContact("store-a")).toEqual({});
  });

  it("không có localStorage (máy chặn) → vẫn chạy, không ném", async () => {
    vi.stubGlobal("localStorage", undefined);
    sdk.getSetting.mockResolvedValueOnce({ authSetting: {} }).mockResolvedValueOnce({ authSetting: GRANTED });
    expect(await requestZaloContact("store-a")).toEqual({ name: "Nguyễn Văn A", phone: "0912345678" });
  });
});
