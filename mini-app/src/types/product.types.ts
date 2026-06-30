// Topping (add-on) tuỳ chọn của món — chỉ chứa topping còn bán (is_available)
export interface Topping {
  id: string;
  name: string;
  price: number; // phụ thu, VNĐ
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  isAvailable: boolean;
  categoryId: string;
  sortOrder: number;
  toppings: Topping[]; // [] nếu món không có topping
}
