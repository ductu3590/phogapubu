import type { Product } from "@/types/product.types";
import { menuBadge } from "@/utils/menu-badge";
import { LeafIcon } from "@/components/common/icons";

// Nhãn món "Best seller" / "Món của quán" (PA-4). Màu theo màu chủ đạo của quán (primary runtime):
// nền nhạt + chữ đậm, không chói. Nhãn lạ / null → không vẽ gì.
// Theme garden: không viên nền, chỉ chữ nâu be (5,5:1) kèm chiếc lá nhỏ — đỡ rối dòng tên món.
export default function BadgePill({ badge, className }: { badge: Product["badge"]; className?: string }) {
  const b = menuBadge(badge);
  if (!b) return null;
  return (
    <span className={`inline-flex w-fit shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xxxsmall font-bold text-primary garden:bg-transparent garden:p-0 garden:text-xsmall garden:font-bold garden:text-[color:var(--g-sand-text)] ${className ?? ""}`}>
      <LeafIcon className="hidden size-3.5 garden:block" />
      {b.label}
    </span>
  );
}
