import { CartItem } from "@/types/cart.types";

export const calculateCartItemPrice = (item: CartItem) => {
  const variantsTotal = item.selectedVariants.reduce(
    (sum, variant) => sum + variant.extraPrice * (variant.quantity || 1),
    0,
  );
  return item.basePrice + variantsTotal;
};

export const calculateCartTotal = (items: CartItem[]) =>
  items.reduce(
    (sum, item) => sum + calculateCartItemPrice(item) * item.quantity,
    0,
  );

