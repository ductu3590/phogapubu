import { CartItem } from "@/types/cart.types";

// Khoá dòng giỏ = món + biến thể + tổ hợp topping (đã sort).
// Cùng khoá thì cộng dồn số lượng; khác khoá thì thành dòng riêng.
export const buildCartItemId = (
  item: Pick<CartItem, "productId" | "selectedVariants"> & Pick<Partial<CartItem>, "variant">,
): string => {
  const toppingIds = item.selectedVariants
    .filter((v) => v.groupId === "topping")
    .map((v) => v.optionId)
    .sort();
  return [item.productId, item.variant?.id ?? "", toppingIds.join(",")]
    .join("|")
    .replace(/\|+$/, "");
};
