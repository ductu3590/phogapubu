import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartItem } from "@/types/cart.types";
import { buildCartItemId } from "@/utils/cart-key";

type Draft = { items: CartItem[]; requestId: string | null };
type Store = {
  drafts: Record<string, Draft>;
  items: (storeId: string, reservationId: string) => CartItem[];
  add: (storeId: string, reservationId: string, item: Omit<CartItem, "id">) => void;
  updateQuantity: (storeId: string, reservationId: string, itemId: string, quantity: number) => void;
  requestId: (storeId: string, reservationId: string) => string;
  clear: (storeId: string, reservationId: string) => void;
};
const key = (storeId: string, reservationId: string) => `${storeId}:${reservationId}`;
const requestId = () => crypto.randomUUID();

export const usePreorderCartStore = create<Store>()(persist((set, get) => ({
  drafts: {},
  items: (storeId, reservationId) => get().drafts[key(storeId, reservationId)]?.items ?? [],
  add: (storeId, reservationId, item) => set((state) => {
    const k = key(storeId, reservationId); const current = state.drafts[k] ?? { items: [], requestId: null };
    const id = buildCartItemId(item); const found = current.items.find((x) => x.id === id);
    const items = found ? current.items.map((x) => x.id === id ? { ...x, quantity: x.quantity + item.quantity } : x) : [...current.items, { ...item, id }];
    return { drafts: { ...state.drafts, [k]: { ...current, items } } };
  }),
  updateQuantity: (storeId, reservationId, itemId, quantity) => set((state) => {
    const k = key(storeId, reservationId); const current = state.drafts[k] ?? { items: [], requestId: null };
    const items = quantity <= 0 ? current.items.filter((x) => x.id !== itemId) : current.items.map((x) => x.id === itemId ? { ...x, quantity } : x);
    return { drafts: { ...state.drafts, [k]: { ...current, items } } };
  }),
  requestId: (storeId, reservationId) => {
    const k = key(storeId, reservationId); const current = get().drafts[k];
    if (current?.requestId) return current.requestId;
    const id = requestId(); set((state) => ({ drafts: { ...state.drafts, [k]: { items: state.drafts[k]?.items ?? [], requestId: id } } })); return id;
  },
  clear: (storeId, reservationId) => set((state) => { const next = { ...state.drafts }; delete next[key(storeId, reservationId)]; return { drafts: next }; }),
}), { name: "mevo_preorder_cart", storage: createJSONStorage(() => localStorage) }));
