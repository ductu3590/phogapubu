import { Product } from "./product.types";

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
}

export interface CategoryWithProducts extends Category {
  products: Product[];
}
