import { describe, expect, it } from "vitest";
import { oaFollowMessage } from "./oa-follow-message";

describe("oaFollowMessage — nút tim quan tâm OA", () => {
  it("đã quan tâm từ trước → báo lại, không im lặng", () => {
    expect(oaFollowMessage({ kind: "already" }, "Bia lẩu Bảo Lương")).toBe("Bạn đã quan tâm Bia lẩu Bảo Lương trên Zalo");
  });
  it("vừa quan tâm xong", () => {
    expect(oaFollowMessage({ kind: "followed" }, "Quán A")).toBe("Đã quan tâm Quán A trên Zalo");
  });
  it("khách từ chối (-201) → không coi là lỗi", () => {
    expect(oaFollowMessage({ kind: "denied" }, "Quán A")).toBeNull();
  });
  it("lỗi khác → hiện mã để còn tra", () => {
    expect(oaFollowMessage({ kind: "error", code: -1402 }, "Quán A")).toBe("Chưa quan tâm được quán (mã -1402). Thử lại sau.");
    expect(oaFollowMessage({ kind: "error" }, "Quán A")).toBe("Chưa quan tâm được quán (mã ?). Thử lại sau.");
  });
});
