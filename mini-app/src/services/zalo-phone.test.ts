import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock bị hoist lên đầu file → biến dùng trong factory phải tạo bằng vi.hoisted (như payment.service.test.ts).
const sdk = vi.hoisted(() => ({
  getPhoneNumber: vi.fn(),
  getAccessToken: vi.fn(),
}));
vi.mock("zmp-sdk", () => sdk);

import { fetchZaloPhone, zaloPhoneErrorMessage } from "./zalo-phone";

const fetchMock = vi.fn();

function reply(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  sdk.getPhoneNumber.mockResolvedValue({ token: "tok-1" });
  sdk.getAccessToken.mockResolvedValue("acc-1");
  fetchMock.mockImplementation(() => reply({ phone: "84912345678" }));
});

describe("fetchZaloPhone", () => {
  it("thành công: gửi storeId + token + accessToken, trả số đã chuẩn hoá 84 → 0", async () => {
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: true, phone: "0912345678" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/functions\/v1\/zalo-phone$/);
    expect(JSON.parse(init.body)).toEqual({ storeId: "store-a", token: "tok-1", accessToken: "acc-1" });
  });

  it("mỗi lần gọi lấy token MỚI (token Zalo dùng 1 lần)", async () => {
    await fetchZaloPhone("store-a");
    await fetchZaloPhone("store-a");
    expect(sdk.getPhoneNumber).toHaveBeenCalledTimes(2);
  });

  it("khách từ chối (SDK ném lỗi) → denied, không gọi server", async () => {
    sdk.getPhoneNumber.mockRejectedValue(new Error("-1402"));
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: false, error: "denied" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("SDK không trả token → denied", async () => {
    sdk.getPhoneNumber.mockResolvedValue({});
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: false, error: "denied" });
  });

  it("không lấy được access token → zalo_error", async () => {
    sdk.getAccessToken.mockRejectedValue(new Error("x"));
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: false, error: "zalo_error" });
  });

  it("server báo quán chưa cấu hình → not_configured", async () => {
    fetchMock.mockImplementation(() => reply({ error: "not_configured" }, 409));
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: false, error: "not_configured" });
  });

  it("server báo lỗi Zalo → zalo_error", async () => {
    fetchMock.mockImplementation(() => reply({ error: "zalo_error" }, 502));
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: false, error: "zalo_error" });
  });

  it("số rác từ server → zalo_error, không trả số", async () => {
    fetchMock.mockImplementation(() => reply({ phone: "12" }));
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: false, error: "zalo_error" });
  });

  it("fetch ném lỗi mạng → network", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: false, error: "network" });
  });

  it("body không phải JSON → zalo_error", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response("oops", { status: 500 })));
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: false, error: "zalo_error" });
  });
});

describe("zaloPhoneErrorMessage", () => {
  it.each(["denied", "not_configured", "zalo_error", "network"] as const)("%s có câu tiếng Việt nhắc nhập tay", (code) => {
    expect(zaloPhoneErrorMessage(code)).toMatch(/nhập tay/);
  });
});
