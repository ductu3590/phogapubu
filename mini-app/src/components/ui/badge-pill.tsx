import type { Product } from "@/types/product.types";
import { menuBadge } from "@/utils/menu-badge";

// Nhãn món "Best seller" / "Món của quán" (PA-4). Màu theo màu chủ đạo của quán (primary runtime):
// nền nhạt + chữ đậm, không chói. Nhãn lạ / null → không vẽ gì.
// Theme garden: không viên nền, chỉ chữ nâu be (5,5:1) kèm chiếc lá đặc nhỏ — đúng bản vẽ
// docs/design/yen-garden/apple-hig (lá vẽ tay, không có trong bộ lucide).
export default function BadgePill({ badge, className }: { badge: Product["badge"]; className?: string }) {
  const b = menuBadge(badge);
  if (!b) return null;
  return (
    <span className={`inline-flex w-fit shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xxxsmall font-bold text-primary garden:bg-transparent garden:p-0 garden:text-xsmall garden:font-bold garden:text-[color:var(--g-sand-text)] ${className ?? ""}`}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="hidden size-3.5 garden:block">
        <path d="M20 4c-9 0-15 4-15 11 0 1.7.5 3.2 1.3 4.4C8 14 11 10.5 16 8.5 12 11 9.5 14.5 8.2 20.4 9.3 20.8 10.6 21 12 21c6 0 8-7 8-17z" />
      </svg>
      {b.label}
    </span>
  );
}
