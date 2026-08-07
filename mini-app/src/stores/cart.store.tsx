import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { CartItem, SelectedVariant } from "@/types/cart.types";

interface CartStore {
  items: CartItem[];
  totalItems: number;
  totalAmount: number;
  checkoutSheetVisible: boolean;
  addToCart: (item: Omit<CartItem, "id">) => void;
  updateCartItem: (id: string, item: Omit<CartItem, "id">) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  // Id đơn đang chờ thanh toán. Khác null = giỏ bị đóng băng vì đã chốt vào một đơn pending;
  // mọi thao tác sửa giỏ (kể cả từ trang menu) đều bị chặn cho tới khi đơn được huỷ hoặc trả xong.
  lockedByOrderId: string | null;
  setCartLock: (orderId: string | null) => void;
  openCheckoutSheet: () => void;
  closeCheckoutSheet: () => void;
}

// ID cart line = productId + tổ hợp topping (đã sort) → cùng món khác topping = 2 line,
// cùng tổ hợp thì gộp số lượng.
const generateCartItemId = (item: Omit<CartItem, "id">): string => {
  const toppingIds = item.selectedVariants
    .filter((v) => v.groupId === "topping")
    .map((v) => v.optionId)
    .sort();
  return toppingIds.length > 0
    ? `${item.productId}|${toppingIds.join(",")}`
    : item.productId;
};

// Helper function to calculate totals
const calculateTotals = (items: CartItem[]) => {
  const totalItems = items.reduce((total, item) => total + item.quantity, 0);
  const totalAmount = items.reduce((total, item) => {
    const variantsTotal = item.selectedVariants.reduce(
      (sum, variant) => sum + variant.extraPrice * (variant.quantity || 1),
      0
    );
    const itemPrice = item.basePrice + variantsTotal;
    return total + itemPrice * item.quantity;
  }, 0);
  return { totalItems, totalAmount };
};

const CART_KEY = "mevo_cart";

// Giỏ để quá 6 tiếng thì coi như phiên ăn đã xong — cùng cửa sổ với "Món đã gọi"
// (zalo_user_id + table_id + 6h). Khách hôm sau quét lại không nên thấy giỏ hôm trước.
const CART_TTL_MS = 6 * 60 * 60 * 1000;

// Storage tự đóng dấu thời gian. Đặt savedAt CẠNH {state, version} của zustand chứ không lồng
// vào trong, để zustand đọc phần nó cần và bỏ qua phần của mình.
// KHÔNG dùng mini-app riêng của quán khác được: mỗi quán là một Zalo Mini App riêng nên
// localStorage đã tách sẵn theo quán, không cần scope thêm store_id.
const cartStorage = createJSONStorage(() => ({
  getItem: (name: string): string | null => {
    try {
      const raw = localStorage.getItem(name);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { savedAt?: number };
      if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > CART_TTL_MS) {
        localStorage.removeItem(name);
        return null;
      }
      return raw;
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(
        name,
        JSON.stringify({ ...(JSON.parse(value) as object), savedAt: Date.now() }),
      );
    } catch {
      /* localStorage đầy hoặc bị chặn — chỉ mất khả năng khôi phục giỏ */
    }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* bỏ qua */
    }
  },
}));

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
  items: [],
  totalItems: 0,
  totalAmount: 0,
  checkoutSheetVisible: false,
  lockedByOrderId: null,

  addToCart: (newItem) => {
    if (get().lockedByOrderId) return;
    const itemId = generateCartItemId(newItem);

    set((state) => {
      const existingItemIndex = state.items.findIndex((item) => item.id === itemId);

      let newItems: CartItem[];
      if (existingItemIndex !== -1) {
        // Item exists, increase quantity
        newItems = [...state.items];
        newItems[existingItemIndex] = {
          ...newItems[existingItemIndex],
          quantity: newItems[existingItemIndex].quantity + newItem.quantity,
        };
      } else {
        // New item, add to cart
        newItems = [...state.items, { ...newItem, id: itemId }];
      }

      const { totalItems, totalAmount } = calculateTotals(newItems);
      return { items: newItems, totalItems, totalAmount };
    });
  },

  updateCartItem: (id, updatedItem) => {
    if (get().lockedByOrderId) return;
    set((state) => {
      // Remove the old item and add the updated one
      const newItems = state.items.filter((item) => item.id !== id);
      const newItemId = generateCartItemId(updatedItem);

      // Check if the updated item matches an existing item
      const existingItemIndex = newItems.findIndex((item) => item.id === newItemId);

      if (existingItemIndex !== -1) {
        // Merge quantities if the updated item matches an existing one
        newItems[existingItemIndex] = {
          ...newItems[existingItemIndex],
          quantity: newItems[existingItemIndex].quantity + updatedItem.quantity,
        };
      } else {
        // Add as new item
        newItems.push({ ...updatedItem, id: newItemId });
      }

      const { totalItems, totalAmount } = calculateTotals(newItems);
      return { items: newItems, totalItems, totalAmount };
    });
  },

  updateQuantity: (id, quantity) => {
    if (get().lockedByOrderId) return;
    set((state) => {
      let newItems: CartItem[];
      if (quantity <= 0) {
        // Remove item if quantity is 0 or less
        newItems = state.items.filter((item) => item.id !== id);
      } else {
        newItems = state.items.map((item) =>
          item.id === id ? { ...item, quantity } : item
        );
      }

      const { totalItems, totalAmount } = calculateTotals(newItems);
      return { items: newItems, totalItems, totalAmount };
    });
  },

  removeItem: (id) => {
    if (get().lockedByOrderId) return;
    set((state) => {
      const newItems = state.items.filter((item) => item.id !== id);
      const { totalItems, totalAmount } = calculateTotals(newItems);
      return { items: newItems, totalItems, totalAmount };
    });
  },

  clearCart: () => {
    set({ items: [], totalItems: 0, totalAmount: 0, lockedByOrderId: null });
  },

  setCartLock: (orderId) => {
    set({ lockedByOrderId: orderId });
  },

  openCheckoutSheet: () => {
    set({ checkoutSheetVisible: true });
  },

  closeCheckoutSheet: () => {
    set({ checkoutSheetVisible: false });
  },
    }),
    {
      name: CART_KEY,
      storage: cartStorage,
      // CHỈ lưu items. totalItems/totalAmount là giá trị dẫn xuất — lưu lại là mời hai nguồn
      // sự thật lệch nhau; tính lại lúc khôi phục.
      // lockedByOrderId KHÔNG lưu: khoá do trang giỏ hàng / hộp thoại nhắc đặt lại sau khi
      // đã đối chiếu DB. Lưu khoá mà đơn đã chết thì giỏ đóng băng mà không ai mở ra được.
      // checkoutSheetVisible là trạng thái UI nhất thời.
      partialize: (s) => ({ items: s.items }) as unknown as CartStore,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const { totalItems, totalAmount } = calculateTotals(state.items);
        state.totalItems = totalItems;
        state.totalAmount = totalAmount;
      },
    },
  ),
);
