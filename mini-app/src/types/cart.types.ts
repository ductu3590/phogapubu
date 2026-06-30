// selectedVariants chứa topping đã chọn (groupId = "topping")
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
  selectedVariants: SelectedVariant[];   // topping đã chọn; [] nếu món không topping
  quantity: number;
  note?: string;
}
