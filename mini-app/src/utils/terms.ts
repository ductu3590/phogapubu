import { DEFAULT_TERMS, DEFAULT_TERMS_POSTPAY } from "@/constants/terms";
import type { StorePaymentTiming } from "./store-model";

// Điều khoản hiển thị cho khách. Quán đã nhập terms_of_use thì dùng nguyên văn của quán;
// chưa nhập thì lấy mẫu mặc định ĐÚNG mô hình: quán trả sau không được hiện mẫu nói về
// thanh toán online, mang về và hoàn tiền.
export function resolveTerms(termsOfUse: string | null | undefined, paymentTiming: StorePaymentTiming): string {
  const custom = (termsOfUse ?? "").trim();
  if (custom) return custom;
  return paymentTiming === "postpay" ? DEFAULT_TERMS_POSTPAY : DEFAULT_TERMS;
}
