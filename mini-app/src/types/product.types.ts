// MVP: Không có variants, chỉ item đơn giản
export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  isAvailable: boolean;
  categoryId: string;
  sortOrder: number;
}
