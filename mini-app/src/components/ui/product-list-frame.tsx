import type { ReactNode } from "react";
import type { ProductLayout } from "@/utils/product-layout";

// Khung bọc các thẻ món của một danh mục, theo bố cục:
//   grid   → lưới 2 cột (classic, danh mục nhiều ảnh)
//   list   → một thẻ trắng chứa các dòng (classic, danh mục ít ảnh)
//   garden → các dòng nằm thẳng trên nền trang, ngăn bằng nét kẻ mảnh (theme garden)
export default function ProductListFrame({ layout, children }: { layout: ProductLayout; children: ReactNode }) {
  if (layout === "garden") return <div className="px-4">{children}</div>;
  if (layout === "grid") return <div className="grid grid-cols-2 gap-3 px-3">{children}</div>;
  return <div className="mx-3 divide-y divide-neutral100 overflow-hidden rounded-2xl bg-surface shadow-card">{children}</div>;
}
