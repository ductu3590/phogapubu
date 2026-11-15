import { Product } from "./product.types";

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
}

export interface CategoryWithProducts extends Category {
  /** mig 136 — món thuộc danh mục này được gợi ý "gọi thêm nhanh" (bia, rượu). */
  quickReorder: boolean;
  products: Product[];
}
