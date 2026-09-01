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
  // Lựa chọn quyết định giá (Tháp/Ca/Cốc). Không có = món thường.
  // basePrice của dòng giỏ = variant.price khi có biến thể → calculateTotals không phải sửa.
  variant?: { id: string; name: string; price: number };
  quantity: number;
  note?: string;
}
