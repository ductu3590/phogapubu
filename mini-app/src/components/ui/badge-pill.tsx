import type { Product } from "@/types/product.types";
import { menuBadge } from "@/utils/menu-badge";

// Nhãn món "Best seller" / "Món của quán" (PA-4). Màu theo màu chủ đạo của quán (primary runtime):
// nền nhạt + chữ đậm, không chói. Nhãn lạ / null → không vẽ gì.
export default function BadgePill({ badge, className }: { badge: Product["badge"]; className?: string }) {
  const b = menuBadge(badge);
  if (!b) return null;
  return (
    <span className={`inline-flex w-fit shrink-0 items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-xxxsmall font-bold text-primary ${className ?? ""}`}>
      {b.label}
    </span>
  );
}
