import { describe, expect, it } from "vitest";
import { DEFAULT_TERMS, DEFAULT_TERMS_POSTPAY } from "@/constants/terms";
import { resolveTerms } from "./terms";

describe("resolveTerms — điều khoản hiển thị cho khách", () => {
  it("quán đã nhập điều khoản riêng: dùng của quán ở cả hai mô hình", () => {
    expect(resolveTerms("  # Nội quy quán  ", "prepay")).toBe("# Nội quy quán");
    expect(resolveTerms("  # Nội quy quán  ", "postpay")).toBe("# Nội quy quán");
  });

  it("quán trả trước chưa nhập: giữ mẫu mặc định cũ", () => {
    expect(resolveTerms("", "prepay")).toBe(DEFAULT_TERMS);
    expect(resolveTerms("   ", "prepay")).toBe(DEFAULT_TERMS);
    expect(resolveTerms(null, "prepay")).toBe(DEFAULT_TERMS);
  });

  it("quán trả sau chưa nhập: dùng mẫu gọi món tại bàn, trả tiền ở quầy", () => {
    expect(resolveTerms("", "postpay")).toBe(DEFAULT_TERMS_POSTPAY);
    expect(resolveTerms(undefined, "postpay")).toBe(DEFAULT_TERMS_POSTPAY);
  });

  it("mẫu trả sau không nhắc thanh toán online, mang về, hoàn tiền", () => {
    expect(DEFAULT_TERMS_POSTPAY).not.toMatch(/mang về/i);
    expect(DEFAULT_TERMS_POSTPAY).not.toMatch(/hoàn tiền/i);
    expect(DEFAULT_TERMS_POSTPAY).not.toMatch(/giao/i);
    expect(DEFAULT_TERMS_POSTPAY).toMatch(/thanh toán tại quầy/);
    expect(DEFAULT_TERMS_POSTPAY).toMatch(/quét mã QR tại bàn/);
  });

  it("mẫu trả sau chỉ dùng cú pháp renderer hỗ trợ (#, ##, gạch đầu dòng, đoạn văn)", () => {
    for (const line of DEFAULT_TERMS_POSTPAY.split("\n")) {
      if (line.trim() === "") continue;
      expect(line).toMatch(/^(# |## |- |[^\s#\-*>|`\d])/);
    }
  });
});
