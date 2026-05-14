// MVP: selectedVariants luôn rỗng, giữ để tương thích với cart utils
export interface SelectedVariant {
  groupId: string;
  groupTitle: string;
  optionId: string;
  optionName: string;
  extraPrice: number;
  quantity?: number;
}

export interface CartItem {
  id: string;           // == menuItemId (product id)
  productId: string;    // string UUID từ Supabase
  productName: string;
  productImage: string;
  basePrice: number;
  selectedVariants: SelectedVariant[];   // luôn [] cho MVP
  quantity: number;
  note?: string;
}
