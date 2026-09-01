import { CartItem } from "@/types/cart.types";

// Khoá dòng giỏ = món + biến thể + tổ hợp topping (đã sort).
// Cùng khoá thì cộng dồn số lượng; khác khoá thì thành dòng riêng.
export const buildCartItemId = (
  item: Pick<CartItem, "productId" | "selectedVariants"> & Pick<Partial<CartItem>, "variant">,
): string => {
  const toppings = item.selectedVariants
    .filter((v) => v.groupId === "topping")
    .map((v) => v.optionId)
    .sort()
    .join(",");

  // Món không có biến thể: giữ Y HỆT khoá cũ để giỏ khách đã lưu trước khi
  // cập nhật vẫn gộp đúng dòng, không đẻ dòng trùng.
  if (!item.variant) return toppings ? `${item.productId}|${toppings}` : item.productId;

  // Có biến thể: thêm đoạn "v:<id>" — tiền tố v: để không lẫn với đoạn topping.
  return toppings
    ? `${item.productId}|v:${item.variant.id}|${toppings}`
    : `${item.productId}|v:${item.variant.id}`;
};
