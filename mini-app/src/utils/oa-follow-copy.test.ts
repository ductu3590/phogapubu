import { describe, expect, it } from "vitest";
import { oaFollowCopy } from "./oa-follow-copy";

describe("oaFollowCopy — lời mời quan tâm OA theo mô hình quán", () => {
  it("quán trả trước giữ nguyên lời cũ (ZNS món xong + form mang về)", () => {
    expect(oaFollowCopy("prepay")).toEqual({
      followTitle: "Nhận thông báo Zalo (ZNS)",
      followDesc: "Biết ngay khi món xong. Hoàn toàn miễn phí.",
      contactTitle: "Tên & Số điện thoại",
      contactDesc: "Điền form mang về nhanh hơn. Không spam.",
      ctaDesc: "Thông báo khi món xong + điền form nhanh hơn.",
    });
  });

  it("quán trả sau không hứa báo món xong, không nhắc mang về", () => {
    const copy = oaFollowCopy("postpay");
    const all = Object.values(copy).join(" ");
    expect(all).not.toMatch(/món xong/i);
    expect(all).not.toMatch(/mang về/i);
    expect(all).not.toMatch(/ZNS/);
    expect(copy.followDesc).toBe(
      "Nhận tin tức, ưu đãi của quán và nhắn tin cho quán qua Zalo. Hoàn toàn miễn phí.",
    );
    expect(copy.contactDesc).toBe("Điền sẵn khi bạn đặt bàn. Không spam.");
    expect(copy.ctaDesc).toBe("Nhận tin tức, ưu đãi của quán và nhắn tin cho quán qua Zalo.");
  });
});
